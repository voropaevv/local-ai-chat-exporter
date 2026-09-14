import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

describe("preview viewport layout", () => {
  test("keeps the page fixed to the viewport and gives scrolling space to the iframe", () => {
    const styles = readFileSync(resolve(projectRoot, "src/ui/styles.css"), "utf8");

    expect(styles).toContain("body:has(.app-shell--preview)");
    expect(styles).toMatch(
      /body:has\(\.app-shell--preview\)\s*{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s
    );
    expect(styles).toMatch(
      /\.app-shell--preview\s*{[^}]*display:\s*flex;[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s
    );
    expect(styles).toMatch(/\.preview-frame\s*{[^}]*flex:\s*1 1 0;[^}]*min-height:\s*0;/s);
    expect(styles).not.toContain("min-height: calc(100vh - 178px);");
  });
});
