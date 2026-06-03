import { describe, expect, test } from "vitest";

import {
  createBatchEntryBase,
  createBatchManifest,
  createBatchRootDirectory,
  getBatchCandidateTabs,
  type BatchExportResult
} from "../../../src/core/batch";
import { formatBatchTabDetail } from "../../../src/ui/components/BatchExport";

describe("batch export core helpers", () => {
  test("lists only supported opened AI chat tabs with tab ids", () => {
    expect(
      getBatchCandidateTabs([
        { id: 1, title: "First", url: "https://chatgpt.com/c/one" },
        { id: 2, title: "Legacy", url: "https://chat.openai.com/c/two" },
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
      }
    ]);
  });

  test("creates deterministic batch root and unique entry names", () => {
    const root = createBatchRootDirectory("2026-05-31T10:20:30.000Z");

    expect(root).toBe("local-ai-chat-export-2026-05-31");
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

  test("formats batch tab details with URL and tab id to disambiguate duplicate titles", () => {
    expect(
      formatBatchTabDetail({
        id: 9,
        platform: "chatgpt",
        platformLabel: "ChatGPT",
        title: "DNA Analysis",
        url: "https://chatgpt.com/c/abc123?model=test"
      })
    ).toBe("chatgpt.com/c/abc123?model=test - tab 9");
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
        rootDirectory: "local-ai-chat-export-2026-05-31"
      })
    ).toEqual({
      exportedAt: "2026-05-31T10:20:30.000Z",
      generatedBy: "local-ai-chat-exporter",
      resultCount: 2,
      rootDirectory: "local-ai-chat-export-2026-05-31",
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
