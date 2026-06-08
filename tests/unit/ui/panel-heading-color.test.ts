import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

describe("panel heading color", () => {
  test("uses the existing product blue token for block headings", () => {
    const stylesSource = readFileSync(resolve(projectRoot, "src/ui/styles.css"), "utf8");
    const headingRule = stylesSource.match(/h2,\nlegend \{(?<body>[^}]+)\}/u);

    expect(headingRule?.groups?.body).toContain("color: var(--color-product-blue);");
  });
});
