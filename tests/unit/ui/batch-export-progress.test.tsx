// @vitest-environment jsdom

import { render } from "preact";
import { afterEach, describe, expect, test } from "vitest";

import { BatchExport } from "../../../src/ui/components/BatchExport";

const container = document.createElement("div");

afterEach(() => {
  render(null, container);
});

describe("BatchExport progress", () => {
  test("shows a privacy-safe x/y phase with accessible progress values", () => {
    render(
      <BatchExport
        busy={true}
        candidates={[]}
        onClearSelection={() => undefined}
        onExportSelected={() => undefined}
        onLoadAllCandidates={() => undefined}
        onLoadChatGptCandidates={() => undefined}
        onSelectAll={() => undefined}
        onToggleTab={() => undefined}
        progress={{ phase: "scanning", position: 2, total: 6 }}
        results={[]}
        selectedTabIds={[]}
        status="Exporting locally"
        statusTone="progress"
      />,
      container
    );

    const progress = container.querySelector('[role="progressbar"]');
    const visibleStatus = container.querySelector('[role="status"]');

    expect(progress?.getAttribute("aria-valuemin")).toBe("1");
    expect(progress?.getAttribute("aria-valuemax")).toBe("6");
    expect(progress?.getAttribute("aria-valuenow")).toBe("2");
    expect(progress?.getAttribute("aria-valuetext")).toBe(
      "Chat 2 of 6: scanning the full conversation"
    );
    expect(visibleStatus?.textContent).toBe("Chat 2 of 6: scanning the full conversation");
    expect(container.textContent).not.toContain("title");
    expect(container.textContent).not.toContain("https://");
  });

  test("labels a non-complete successful scan as potentially partial", () => {
    render(
      <BatchExport
        busy={false}
        candidates={[]}
        onClearSelection={() => undefined}
        onExportSelected={() => undefined}
        onLoadAllCandidates={() => undefined}
        onLoadChatGptCandidates={() => undefined}
        onSelectAll={() => undefined}
        onToggleTab={() => undefined}
        results={[
          {
            completenessStatus: "partial",
            files: [],
            messageCount: 18,
            platform: "chatgpt",
            status: "success",
            tabId: 5,
            title: "Long chat",
            url: "https://chatgpt.com/c/long",
            warnings: ["The beginning could not be verified."]
          }
        ]}
        selectedTabIds={[]}
        status="Saved one ZIP"
        statusTone="warning"
      />,
      container
    );

    expect(container.querySelector(".batch-result-list")?.textContent).toContain(
      "18 messages - may be partial"
    );
  });
});
