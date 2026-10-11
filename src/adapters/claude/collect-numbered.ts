import type { ExportedMessage } from "../../core/schema";
import { ExportPipelineError } from "../../core/export-errors";
import { extractVisibleClaudeMessages } from "./extract-visible";

interface Options {
  document: Document;
  signal?: AbortSignal;
  maxSteps?: number;
  wait?: () => Promise<void>;
}

// Claude's explicit accessibility inventory provides a denominator independent
// of viewport geometry. Unknown layouts must retain the visible-only fallback.
export async function collectNumberedClaudeMessages(options: Options): Promise<{
  messages: readonly ExportedMessage[];
  complete: boolean;
  steps: number;
} | null> {
  const root = options.document;
  const inventory = () =>
    Array.from(root.querySelectorAll('[role="article"][aria-label]')).flatMap((element) => {
      const match = /^Message (\d+) of (\d+)$/.exec(element.getAttribute("aria-label") ?? "");
      if (!match) return [];
      const index = Number(match[1]);
      const total = Number(match[2]);
      return index > 0 && index <= total && total <= 100000 ? [{ element, index, total }] : [];
    });
  const initial = inventory();
  if (!initial.length) return null;
  let container: Element = root.scrollingElement ?? root.documentElement;
  for (let node = initial[0].element.parentElement; node; node = node.parentElement) {
    if (
      node.scrollHeight > node.clientHeight &&
      /^(auto|scroll|overlay)$/.test(root.defaultView?.getComputedStyle(node).overflowY ?? "")
    ) {
      container = node;
      break;
    }
  }
  const originalTop = container.scrollTop;
  const messages = new Map<number, ExportedMessage>();
  let total = initial[0].total;
  let previousComplete = "";
  const requestedEarlierInventories = new Set<string>();
  let steps = 0;
  const wait = options.wait ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
  const deadline = Date.now() + 120000;
  try {
    // Always visit the oldest boundary before advancing through virtualized turns.
    container.scrollTop = 0;
    for (; steps < (options.maxSteps ?? 400) && Date.now() < deadline; steps++) {
      if (options.signal?.aborted)
        throw new ExportPipelineError("scan_cancelled", "Claude collection cancelled");
      await wait();
      if (options.signal?.aborted)
        throw new ExportPipelineError("scan_cancelled", "Claude collection cancelled");
      const entries = inventory();
      const totals = new Set(entries.map((entry) => entry.total));
      if (totals.size !== 1) {
        previousComplete = "";
        continue;
      }
      const nextTotal = entries[0].total;
      if (nextTotal !== total) {
        messages.clear();
        total = nextTotal;
      }
      let unstable = false;
      const seen = new Set<number>();
      for (const entry of entries) {
        const extracted = extractVisibleClaudeMessages(entry.element);
        if (
          seen.has(entry.index) ||
          extracted.length !== 1 ||
          entry.element.querySelector('[data-is-streaming="true"]')
        ) {
          unstable = true;
          messages.delete(entry.index);
          continue;
        }
        seen.add(entry.index);
        messages.set(entry.index, {
          ...extracted[0],
          id: `claude-turn-${entry.index}`,
          index: entry.index - 1
        });
      }
      const ordered = [...messages.entries()].sort(([left], [right]) => left - right);
      const allPresent =
        !unstable &&
        ordered.length === total &&
        ordered.every(([index], offset) => index === offset + 1);
      const fingerprint = allPresent ? JSON.stringify(ordered) : "";
      if (fingerprint && fingerprint === previousComplete) {
        return { messages: ordered.map(([, message]) => message), complete: true, steps };
      }
      previousComplete = fingerprint;
      if (!messages.has(1)) {
        container.scrollTop = 0;
        // A hidden tab may not run the provider's scroll-driven virtualizer.
        // Its explicit history control can hydrate without activating the tab.
        // Request once per inventory so a delayed response is never spammed.
        const inventoryKey = `${total}:${entries
          .map((entry) => entry.index)
          .sort((a, b) => a - b)
          .join(",")}`;
        const earlier = Array.from(root.querySelectorAll("button")).find(
          (button) =>
            !button.disabled &&
            button.getAttribute("aria-disabled") !== "true" &&
            (button.getAttribute("aria-label") ?? button.textContent ?? "").trim() ===
              "Load earlier messages"
        );
        if (earlier && !requestedEarlierInventories.has(inventoryKey)) {
          requestedEarlierInventories.add(inventoryKey);
          earlier.click();
        }
      } else if (!allPresent) container.scrollTop += Math.max(1, container.clientHeight * 0.8);
    }
    return {
      messages: [...messages.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, message], index) => ({ ...message, index })),
      complete: false,
      steps
    };
  } finally {
    container.scrollTop = originalTop;
  }
}
