// @vitest-environment jsdom

import { render } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, test } from "vitest";

import type { ConversationExport } from "../../../src/core/schema";
import { MessageSelector } from "../../../src/ui/PreviewApp";

const conversation: ConversationExport = {
  schemaVersion: "1.0",
  platform: "chatgpt",
  platformLabel: "ChatGPT",
  title: "Synthetic selection",
  sourceUrl: "https://chatgpt.com/c/selection",
  exportedAt: "2026-09-12T00:00:00Z",
  messageCount: 4,
  completeness: {
    duplicateCount: 0,
    messageCount: 4,
    platformWarnings: [],
    reachedBottom: true,
    reachedTop: true,
    scrollSteps: 0,
    status: "complete",
    warnings: []
  },
  messages: ["z-first", "a-second", "x-third", "b-last"].map((id, position) => ({
    id,
    index: [90, 5, 200, 1][position]!,
    role: "user",
    authorLabel: "User",
    codeBlocks: [],
    images: [],
    metadata: {},
    text: id
  }))
};
const container = document.createElement("div");

afterEach(() => {
  act(() => render(null, container));
});

function Harness({ source = conversation }: { source?: ConversationExport }) {
  const [selected, setSelected] = useState<readonly string[]>([]);
  return (
    <MessageSelector conversation={source} onChange={setSelected} selectedMessageIds={selected} />
  );
}

function clickMessage(position: number, shiftKey = false, detail = 1) {
  const input = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[position]!;
  act(() => {
    input.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey, detail }));
  });
}

function selectedPositions() {
  return [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].flatMap(
    (input, position) => (input.checked ? [position] : [])
  );
}

function clickControl(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (node) => node.textContent === label
  )!;
  act(() => button.click());
}

describe("Preview message checkbox interaction", () => {
  test("plain activation and shift-click extend and clear inclusive ranges in display order", () => {
    act(() => render(<Harness />, container));
    clickMessage(0);
    clickMessage(2, true);
    expect(selectedPositions()).toEqual([0, 1, 2]);
    clickMessage(0, true);
    expect(selectedPositions()).toEqual([]);
    clickMessage(3);
    clickMessage(1, true);
    expect(selectedPositions()).toEqual([1, 2, 3]);
    expect(container.textContent).toContain("Shift-click to select a range.");
  });

  test("All and None reset the anchor instead of extending a previous range", () => {
    act(() => render(<Harness />, container));
    clickMessage(0);
    clickControl("All");
    clickMessage(3, true);
    expect(selectedPositions()).toEqual([0, 1, 2]);
    clickControl("None");
    clickMessage(2, true);
    expect(selectedPositions()).toEqual([2]);
  });

  test("source changes invalidate the old anchor even if message IDs are the same", () => {
    act(() => render(<Harness />, container));
    clickMessage(0);
    act(() =>
      render(
        <Harness source={{ ...conversation, sourceUrl: "https://chatgpt.com/c/other" }} />,
        container
      )
    );
    clickMessage(3, true);
    expect(selectedPositions()).toEqual([0, 3]);
  });

  test("keyboard-style checkbox activation without pointer detail keeps normal toggle behavior", () => {
    act(() => render(<Harness />, container));
    clickMessage(1, false, 0);
    expect(selectedPositions()).toEqual([1]);
    clickMessage(1, false, 0);
    expect(selectedPositions()).toEqual([]);
  });
});
