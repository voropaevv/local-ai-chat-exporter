import type { ExportedMessage } from "../../core/schema";
import { ExportPipelineError } from "../../core/export-errors";
import { extractVisibleGeminiMessages } from "../gemini/extract-visible";
import { extractVisibleNotebookLmMessages } from "../notebooklm/extract-visible";
import { findHistoryScroller, isHistoryIndicatorVisible } from "./history-dom";

export interface HistoryOptions {
  document: Document;
  signal?: AbortSignal;
  maxSteps?: number;
  wait?: () => Promise<void>;
}

/** Bounded DOM traversal. Boundary stability is evidence, not a server inventory. */
export async function collectProviderHistory(options: HistoryOptions, notebook = false) {
  const root = options.document;
  const panel = notebook ? root.querySelector("chat-panel .chat-panel-content") : root;
  if (!panel) return null;
  const turns = () =>
    Array.from(
      panel.querySelectorAll(notebook ? ".chat-message-pair" : ".conversation-container[id]")
    );
  const keys = new Map<Element, string>();
  const key = (entry: Element) => {
    if (!notebook) return entry.id;
    if (!keys.has(entry)) keys.set(entry, String(keys.size));
    return keys.get(entry)!;
  };
  const initial = turns();
  if (!initial.length) return null;
  initial.forEach(key);
  const scroller = notebook ? (panel as Element) : findHistoryScroller(root, initial[0]);
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
  const check = () => {
    if (options.signal?.aborted) throw new ExportPipelineError("scan_cancelled", "Scan cancelled.");
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
      if (notebook && Array.from(keys.keys()).some((entry) => !entries.includes(entry)))
        invalid = true;
      const ids = entries.map(key);
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
        const extracted = notebook
          ? extractVisibleNotebookLmMessages(entry)
          : extractVisibleGeminiMessages(entry);
        const prior = messages.get(key(entry));
        if (notebook && prior && JSON.stringify(prior) !== JSON.stringify(extracted))
          invalid = true;
        if (extracted.length) messages.set(key(entry), extracted);
      }
      const visible = (element: Element) => isHistoryIndicatorVisible(element);
      const busy =
        scroller.getAttribute("aria-busy") === "true" ||
        Array.from(scroller.querySelectorAll('[aria-busy="true"], [role="progressbar"]')).some(
          visible
        ) ||
        Array.from(
          root.querySelectorAll(
            'button[aria-label="Stop response"], chat-panel button[aria-label="Stop generating"]'
          )
        ).some(visible);
      const fingerprint = JSON.stringify([
        ids,
        scroller.scrollHeight,
        ids.map((id) => messages.get(id))
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
      .map((message, index) => ({
        ...message,
        index,
        ...(notebook ? { id: `notebooklm-history-${index}` } : {})
      }));
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
