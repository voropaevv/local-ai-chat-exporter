import { describe, expect, test } from "vitest";

import type { ExportPipelineError } from "../../../src/core/export-options";
import { ensureContentScript } from "../../../src/utils/content-script";

describe("content script injection", () => {
  test("executes the classic content script file for the target tab", async () => {
    const calls: Array<chrome.scripting.ScriptInjection<[], unknown>> = [];

    await ensureContentScript(42, {
      executeScript(details) {
        calls.push(details);
        return Promise.resolve([]);
      }
    });

    expect(calls).toEqual([
      {
        files: ["content/main.js"],
        target: { tabId: 42 }
      }
    ]);
  });

  test("surfaces script injection failures with an actionable error code", async () => {
    await expect(
      ensureContentScript(42, {
        executeScript() {
          return Promise.reject(new Error("Cannot use import statement outside a module"));
        }
      })
    ).rejects.toMatchObject({
      code: "content_script_injection_failed",
      message: expect.stringContaining("Content script injection failed")
    } satisfies Partial<ExportPipelineError>);
  });
});
