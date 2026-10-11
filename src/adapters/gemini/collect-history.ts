import type { ExportedMessage } from "../../core/schema";
import { ExportPipelineError } from "../../core/export-errors";
import { extractVisibleGeminiMessages } from "./extract-visible";

interface Options {
  document: Document;
  signal?: AbortSignal;
  maxSteps?: number;
  wait?: () => Promise<void>;
}

/** Bounded DOM traversal. Boundary stability is evidence, not a server inventory. */
export async function collectGeminiHistory(options: Options) {
  const root = options.document;
  const turns = () => Array.from(root.querySelectorAll(".conversation-container[id]"));
  const initial = turns();
  if (!initial.length) return null;
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
  const messages = new Map<string, readonly ExportedMessage[]>();
  const order: string[] = [];
  const wait = options.wait ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 500)));
  const deadline = Date.now() + 180000;
  let phase: "top" | "down" = "top";
  let stable = 0;
  let previous = "";
  let reachedTop = false;
  let reachedBottom = false;
  let invalid = false;
  let steps = 0;
  try {
    for (; steps < (options.maxSteps ?? 600) && Date.now() < deadline; steps++) {
      if (options.signal?.aborted)
        throw new ExportPipelineError("scan_cancelled", "Gemini collection cancelled.");
      if (root.defaultView?.location.href !== originalUrl)
        throw new ExportPipelineError(
          "scan_stale",
          "The source conversation changed during preparation."
        );
      if (phase === "top") scroller.scrollTop = 0;
      await wait();
      if (root.defaultView?.location.href !== originalUrl)
        throw new ExportPipelineError(
          "scan_stale",
          "The source conversation changed during preparation."
        );
      if (options.signal?.aborted)
        throw new ExportPipelineError("scan_cancelled", "Gemini collection cancelled.");
      const entries = turns();
      const ids = entries.map((entry) => entry.id);
      if (new Set(ids).size !== ids.length) invalid = true;
      // Insert newly loaded predecessors before their known successor.
      for (let i = ids.length - 1; i >= 0; i--) {
        if (order.includes(ids[i])) continue;
        const next = ids[i + 1];
        const position = next === undefined ? -1 : order.indexOf(next);
        if (position < 0) order.push(ids[i]);
        else order.splice(position, 0, ids[i]);
      }
      for (const entry of entries) {
        const extracted = extractVisibleGeminiMessages(entry);
        if (extracted.length) messages.set(entry.id, extracted);
      }
      const visible = (element: Element) => {
        for (let node: Element | null = element; node; node = node.parentElement) {
          const style = root.defaultView?.getComputedStyle(node);
          if (
            node.hasAttribute("hidden") ||
            style?.display === "none" ||
            style?.visibility === "hidden"
          )
            return false;
        }
        return true;
      };
      const busy =
        scroller.getAttribute("aria-busy") === "true" ||
        Array.from(scroller.querySelectorAll('[aria-busy="true"], [role="progressbar"]')).some(
          visible
        ) ||
        Array.from(root.querySelectorAll('button[aria-label="Stop response"]')).some(visible);
      const fingerprint = JSON.stringify([
        ids,
        scroller.scrollHeight,
        entries.map((entry) => messages.get(entry.id))
      ]);
      const atBoundary =
        phase === "top"
          ? scroller.scrollTop <= 1
          : scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      stable = !busy && atBoundary && fingerprint === previous ? stable + 1 : 0;
      previous = fingerprint;
      // Ten seconds with no boundary/content/loading change in the real runtime.
      if (stable >= 20) {
        if (phase === "top") {
          // Discard the initial bottom viewport's order after top hydration.
          // The subsequent forward pass establishes chronology from this boundary.
          order.splice(0, order.length, ...ids);
          for (const id of messages.keys()) if (!ids.includes(id)) messages.delete(id);
          reachedTop = true;
          phase = "down";
          stable = 0;
          previous = "";
        } else {
          reachedBottom = true;
          break;
        }
      }
      if (phase === "down" && !reachedBottom)
        scroller.scrollTop = Math.min(
          scroller.scrollHeight,
          scroller.scrollTop + Math.max(1, scroller.clientHeight * 0.8)
        );
    }
    if (
      order.some((id) => {
        const pair = messages.get(id);
        return pair?.length !== 2 || pair[0].role !== "user" || pair[1].role !== "assistant";
      })
    )
      invalid = true;
    const ordered = order
      .flatMap((id) => messages.get(id) ?? [])
      .map((message, index) => ({ ...message, index }));
    return {
      messages: ordered,
      reachedTop: reachedTop && !invalid,
      reachedBottom: reachedBottom && !invalid,
      steps
    };
  } finally {
    if (root.defaultView?.location.href === originalUrl) scroller.scrollTop = originalTop;
  }
}
