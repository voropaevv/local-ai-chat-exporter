import type { ExportedMessage } from "../../core/schema";
import { ExportPipelineError } from "../../core/export-errors";
import { cleanChatGptNode } from "./clean-chatgpt-node";

const roles = { "You said:": "user", "ChatGPT said:": "assistant" } as const;

function parts(turn: Element) {
  return Array.from(turn.querySelectorAll("h4")).flatMap((heading) => {
    const label = heading.textContent?.trim() as keyof typeof roles;
    if (!roles[label] || heading.closest("[data-turn-key]") !== turn) return [];
    let block = heading.parentElement;
    if (!block) return [];
    // The current layout groups both roles inside one stable keyed turn.
    // Select the largest exclusive role block, never their shared pair wrapper.
    while (
      block.parentElement &&
      block.parentElement !== turn &&
      block.parentElement.querySelectorAll("h4").length === 1
    )
      block = block.parentElement;
    if (block.querySelectorAll("h4").length !== 1) return [];
    return [{ block, role: roles[label] }];
  });
}

export async function collectModernChatGptTurns(options: {
  document: Document;
  signal?: AbortSignal;
  maxSteps?: number;
  wait?: () => Promise<void>;
}) {
  const root = options.document;
  const turns = () => Array.from(root.querySelectorAll("[data-turn-key]"));
  const initial = turns();
  if (
    !initial.length ||
    root.querySelector("[data-message-author-role], [data-testid^='conversation-turn-']")
  )
    return null;
  let scroller: Element = root.scrollingElement ?? root.documentElement;
  for (let node = initial[0].parentElement; node; node = node.parentElement) {
    if (
      node.scrollHeight > node.clientHeight &&
      /^(auto|scroll|overlay)$/.test(root.defaultView?.getComputedStyle(node).overflowY ?? "")
    ) {
      scroller = node;
      break;
    }
  }
  const originalTop = scroller.scrollTop;
  const originalUrl = root.defaultView?.location.href;
  const collected = new Map<string, readonly ExportedMessage[]>();
  const order: string[] = [];
  const expanded = new WeakSet<Element>();
  const wait = options.wait ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 500)));
  const deadline = Date.now() + 180000;
  let phase: "top" | "down" = "top";
  let stable = 0,
    previous = "",
    steps = 0;
  let reachedTop = false,
    reachedBottom = false,
    invalid = false;
  const check = () => {
    if (options.signal?.aborted)
      throw new ExportPipelineError("scan_cancelled", "Preparation cancelled.");
    if (root.defaultView?.location.href !== originalUrl)
      throw new ExportPipelineError(
        "scan_stale",
        "The source conversation changed during preparation."
      );
  };
  try {
    for (; steps < (options.maxSteps ?? 600) && Date.now() < deadline; steps++) {
      check();
      if (phase === "top") scroller.scrollTop = 0;
      await wait();
      check();
      const entries = turns();
      const ids = entries.map((turn) => turn.getAttribute("data-turn-key") ?? "");
      if (ids.some((id) => !id) || new Set(ids).size !== ids.length) invalid = true;
      let pending = false;
      for (let i = 0; i < entries.length; i++) {
        const id = ids[i];
        if (!order.includes(id)) order.push(id);
        const messages: ExportedMessage[] = [];
        for (const { block, role } of parts(entries[i])) {
          const more = Array.from(block.querySelectorAll("button")).find(
            (button) =>
              (button.getAttribute("aria-label") ?? button.textContent)?.trim() === "Show more"
          );
          if (more) {
            pending = true;
            if (
              !more.disabled &&
              more.getAttribute("aria-disabled") !== "true" &&
              !expanded.has(more)
            ) {
              expanded.add(more);
              more.click();
            }
            continue;
          }
          const clone = block.cloneNode(true) as Element;
          clone.querySelectorAll("h4, button, [role='button']").forEach((node) => node.remove());
          const clean = cleanChatGptNode(clone, { chatGptSpecificCleanup: true });
          if (!clean.text.trim()) continue;
          messages.push({
            ...clean,
            id: `chatgpt-${id}-${role}`,
            index: messages.length,
            role,
            authorLabel: role === "user" ? "You" : "ChatGPT",
            metadata: {}
          });
        }
        if (
          messages.length === 2 &&
          messages[0].role === "user" &&
          messages[1].role === "assistant"
        )
          collected.set(id, messages);
        else {
          collected.delete(id);
          pending = true;
        }
      }
      const busy =
        pending ||
        Array.from(scroller.querySelectorAll("*")).some((element) => {
          const loading =
            element.matches('[aria-busy="true"], [role="progressbar"]') ||
            (element.children.length === 0 &&
              /^Loading (older|newer) messages(?:…|\.{3})?$/.test(
                element.textContent?.trim() ?? ""
              ));
          if (!loading) return false;
          for (let node: Element | null = element; node; node = node.parentElement) {
            const style = root.defaultView?.getComputedStyle(node);
            if (
              node.hasAttribute("hidden") ||
              node.getAttribute("aria-hidden") === "true" ||
              style?.display === "none" ||
              style?.visibility === "hidden"
            )
              return false;
          }
          return true;
        });
      const fingerprint = JSON.stringify([
        ids,
        scroller.scrollHeight,
        entries.map((_, i) => collected.get(ids[i]))
      ]);
      const boundary =
        phase === "top"
          ? scroller.scrollTop <= 1
          : scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      stable = !busy && boundary && previous === fingerprint ? stable + 1 : 0;
      previous = fingerprint;
      if (stable >= 20) {
        if (phase === "top") {
          order.splice(0, order.length, ...ids);
          for (const id of collected.keys()) if (!ids.includes(id)) collected.delete(id);
          reachedTop = true;
          phase = "down";
          stable = 0;
          previous = "";
        } else {
          reachedBottom = true;
          break;
        }
      }
      if (phase === "down")
        scroller.scrollTop = Math.min(
          scroller.scrollHeight,
          scroller.scrollTop + Math.max(1, scroller.clientHeight * 0.8)
        );
    }
    invalid ||= order.some((id) => !collected.has(id));
    return {
      messages: order
        .flatMap((id) => collected.get(id) ?? [])
        .map((message, index) => ({ ...message, index })),
      reachedTop: reachedTop && !invalid,
      reachedBottom: reachedBottom && !invalid,
      steps
    };
  } finally {
    if (root.defaultView?.location.href === originalUrl) scroller.scrollTop = originalTop;
  }
}
