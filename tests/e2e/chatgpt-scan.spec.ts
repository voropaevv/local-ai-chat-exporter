import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../..");

test("ChatGPT scan module exports an invoked function and no auto-run hook", async () => {
  const source = await readFile(resolve(projectRoot, "src/content/scan.ts"), "utf8");

  expect(source).toContain("export async function scanCurrentChatGptConversation");
  expect(source).not.toContain("scanCurrentChatGptConversation()");
  expect(source).not.toContain("setInterval");
});
