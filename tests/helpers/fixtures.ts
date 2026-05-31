import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";

const projectRoot = resolve(import.meta.dirname, "..");

export function fixturePath(...segments: readonly string[]): string {
  return resolve(projectRoot, "fixtures", ...segments);
}

export function readFixture(...segments: readonly string[]): string {
  return readFileSync(fixturePath(...segments), "utf8");
}

export function loadFixtureDocument(
  segments: readonly string[],
  url = "https://chatgpt.com/c/fixture"
): Document {
  return new JSDOM(readFixture(...segments), { url }).window.document;
}
