import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

function readProjectFile(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("landing site and store assets", () => {
  test("package exposes local site and store asset build commands", () => {
    const packageJson = JSON.parse(readProjectFile("package.json")) as {
      readonly scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["site:build"]).toBe("node scripts/build-site.mjs");
    expect(packageJson.scripts?.["store-assets:build"]).toBe("node scripts/build-store-assets.mjs");
    expect(packageJson.scripts?.check).toContain("pnpm site:build");
  });

  test("landing site includes required product sections and no remote assets", () => {
    const html = readProjectFile("site/index.html");
    const styles = readProjectFile("site/styles.css");

    for (const expected of [
      "Your AI chats, in files you actually own.",
      'id="features"',
      'id="formats"',
      'id="privacy-model"',
      'id="advanced"',
      'id="platforms"',
      'id="comparison"',
      'id="install"',
      'id="faq"',
      "<button>Export</button>",
      "Install from source"
    ]) {
      expect(html).toContain(expected);
    }

    expect(`${html}\n${styles}`).not.toMatch(/https?:\/\//u);
    expect(html).toContain("assets/jelluvi.png");
    expect(html).toContain("<footer");
    expect(html).toContain("Core exports stay free, local-first, and open-source.");
    expect(html).toContain(">Source</a>");
    expect(html).toContain(">Sponsor</a>");
  });

  test("store asset pack contains listing copy, required promo, icons, and five screenshots", () => {
    const listing = readProjectFile("site/store-assets/store-listing.md");

    expect(listing).toContain("Short description");
    expect(listing).toContain("Long description");
    expect(listing).toContain("Reviewer instructions");
    expect(listing).toContain("Privacy policy URL content");
    expect(listing).toContain("No pricing wall");

    for (const asset of [
      "site/store-assets/icons/icon-128.png",
      "site/store-assets/icons/icon-512.png",
      "site/store-assets/icons/store-icon-128.png",
      "site/store-assets/small-promo-440x280.png",
      "site/store-assets/store-screens/01-one-click-export.png",
      "site/store-assets/store-screens/02-advanced-export.png",
      "site/store-assets/store-screens/03-preview.png",
      "site/store-assets/store-screens/04-batch-export.png",
      "site/store-assets/store-screens/05-local-library.png"
    ]) {
      const path = resolve(projectRoot, asset);
      expect(existsSync(path), asset).toBe(true);
      expect(statSync(path).size, asset).toBeGreaterThan(1000);
    }

    const screenshotRoot = resolve(projectRoot, "site/store-assets/store-screens");
    const screenshotFiles = readdirSync(screenshotRoot).filter((file) => file.endsWith(".png"));

    expect(screenshotFiles).toHaveLength(5);
    for (const file of screenshotFiles) {
      expect(readPngDimensions(readFileSync(resolve(screenshotRoot, file)))).toEqual({
        height: 800,
        width: 1280
      });
    }
    expect(
      readPngDimensions(
        readFileSync(resolve(projectRoot, "site/store-assets/small-promo-440x280.png"))
      )
    ).toEqual({ height: 280, width: 440 });
  });
});

function readPngDimensions(png: Buffer): { readonly height: number; readonly width: number } {
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

  return {
    height: png.readUInt32BE(20),
    width: png.readUInt32BE(16)
  };
}
