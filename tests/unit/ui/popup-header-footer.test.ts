import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

describe("popup header and footer source", () => {
  test("keeps settings as a top header button instead of footer text link", () => {
    const headerSource = readFileSync(
      resolve(projectRoot, "src/ui/components/PopupHeader.tsx"),
      "utf8"
    );
    const footerSource = readFileSync(
      resolve(projectRoot, "src/ui/components/PopupFooter.tsx"),
      "utf8"
    );

    expect(headerSource).toContain("options/index.html#filename-settings");
    expect(headerSource).toContain('className="settings-button"');
    expect(headerSource).toContain("Settings");
    expect(headerSource).not.toContain("Local only");
    expect(headerSource).not.toContain("privacy-badge");
    expect(footerSource).not.toContain("options/index.html#filename-settings");
    expect(footerSource).not.toContain("Settings");
  });
});
