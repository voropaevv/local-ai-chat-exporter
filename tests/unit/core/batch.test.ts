import { describe, expect, test } from "vitest";

import {
  createBatchEntryBase,
  createBatchManifest,
  createBatchRootDirectory,
  getBatchRequiredOrigins,
  getBatchRequiredOriginsForTabs,
  getBatchCandidateTabs,
  type BatchExportResult
} from "../../../src/core/batch";
import {
  formatBatchTabDetail,
  formatBatchTabSummary
} from "../../../src/ui/components/BatchExport";

describe("batch export core helpers", () => {
  test("lists only supported opened AI chat tabs with tab ids", () => {
    expect(
      getBatchCandidateTabs([
        { id: 1, title: "First", url: "https://chatgpt.com/c/one" },
        { id: 2, title: "Legacy", url: "https://chat.openai.com/c/two" },
        { id: 3, title: "Claude", url: "https://claude.ai/chat/three" },
        { id: 4, title: "Gemini", url: "https://gemini.google.com/app/four" },
        { id: 5, title: "Perplexity", url: "https://www.perplexity.ai/search/five" },
        { id: 6, title: "Notebook", url: "https://notebooklm.google.com/notebook/six" },
        { id: 3, title: "Search", url: "https://example.com/" },
        { title: "Missing id", url: "https://chatgpt.com/c/no-id" }
      ])
    ).toEqual([
      {
        id: 1,
        platform: "chatgpt",
        platformLabel: "ChatGPT",
        title: "First",
        url: "https://chatgpt.com/c/one"
      },
      {
        id: 2,
        platform: "chatgpt",
        platformLabel: "ChatGPT",
        title: "Legacy",
        url: "https://chat.openai.com/c/two"
      },
      {
        id: 3,
        platform: "claude",
        platformLabel: "Claude",
        title: "Claude",
        url: "https://claude.ai/chat/three"
      },
      {
        id: 4,
        platform: "gemini",
        platformLabel: "Gemini",
        title: "Gemini",
        url: "https://gemini.google.com/app/four"
      },
      {
        id: 5,
        platform: "perplexity",
        platformLabel: "Perplexity",
        title: "Perplexity",
        url: "https://www.perplexity.ai/search/five"
      },
      {
        id: 6,
        platform: "notebooklm",
        platformLabel: "NotebookLM",
        title: "Notebook",
        url: "https://notebooklm.google.com/notebook/six"
      }
    ]);
  });

  test("collects exact optional host origins for selected batch tabs", () => {
    const tabs = getBatchCandidateTabs([
      { id: 1, title: "First", url: "https://chatgpt.com/c/one" },
      { id: 2, title: "Second", url: "https://chatgpt.com/c/two" },
      { id: 3, title: "Claude", url: "https://claude.ai/chat/three" },
      { id: 4, title: "Perplexity", url: "https://www.perplexity.ai/search/four" }
    ]);

    expect(getBatchRequiredOrigins(tabs[0])).toEqual(["https://chatgpt.com/*"]);
    expect(getBatchRequiredOriginsForTabs(tabs)).toEqual([
      "https://chatgpt.com/*",
      "https://claude.ai/*",
      "https://www.perplexity.ai/*"
    ]);
  });

  test("creates deterministic batch root and unique entry names", () => {
    const root = createBatchRootDirectory("2026-05-31T10:20:30.000Z");

    expect(root).toBe("logthread-export-2026-05-31");
    expect(
      createBatchEntryBase(
        {
          id: 7,
          platform: "chatgpt",
          platformLabel: "ChatGPT",
          title: "API / Auth: plan?",
          url: "https://chatgpt.com/c/auth"
        },
        2
      )
    ).toBe("chatgpt-api-auth-plan-3");
  });

  test("formats batch tab summary with host only and keeps URL details collapsible", () => {
    const tab = {
      id: 9,
      platform: "chatgpt" as const,
      platformLabel: "ChatGPT" as const,
      title: "Research Notes",
      url: "https://chatgpt.com/c/abc123?model=test"
    };

    expect(formatBatchTabSummary(tab)).toBe("chatgpt.com");
    expect(formatBatchTabDetail(tab)).toBe("chatgpt.com/c/abc123?model=test - tab 9");
  });

  test("creates a manifest with success files and failed tabs", () => {
    const results: readonly BatchExportResult[] = [
      {
        files: [
          {
            filename: "chatgpt-first-1.md",
            format: "md",
            mimeType: "text/markdown;charset=utf-8"
          }
        ],
        messageCount: 3,
        status: "success",
        tab: {
          id: 1,
          platform: "chatgpt",
          platformLabel: "ChatGPT",
          title: "First",
          url: "https://chatgpt.com/c/one"
        },
        warnings: ["Partial scan"]
      },
      {
        error: "This page cannot be exported.",
        status: "failed",
        tab: {
          id: 2,
          platform: "chatgpt",
          platformLabel: "ChatGPT",
          title: "Second",
          url: "https://chatgpt.com/c/two"
        },
        warnings: []
      }
    ];

    expect(
      createBatchManifest({
        exportedAt: "2026-05-31T10:20:30.000Z",
        results,
        rootDirectory: "logthread-export-2026-05-31"
      })
    ).toEqual({
      exportedAt: "2026-05-31T10:20:30.000Z",
      generatedBy: "logthread",
      resultCount: 2,
      rootDirectory: "logthread-export-2026-05-31",
      results: [
        {
          files: [
            {
              filename: "chatgpt-first-1.md",
              format: "md",
              mimeType: "text/markdown;charset=utf-8"
            }
          ],
          messageCount: 3,
          platform: "chatgpt",
          status: "success",
          tabId: 1,
          title: "First",
          url: "https://chatgpt.com/c/one",
          warnings: ["Partial scan"]
        },
        {
          error: "This page cannot be exported.",
          platform: "chatgpt",
          status: "failed",
          tabId: 2,
          title: "Second",
          url: "https://chatgpt.com/c/two",
          warnings: []
        }
      ]
    });
  });
});
