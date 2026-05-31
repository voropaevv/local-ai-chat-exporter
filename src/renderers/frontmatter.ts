export type FrontmatterValue = string | number | boolean | readonly string[];

export interface FrontmatterField {
  readonly key: string;
  readonly value: FrontmatterValue;
}

export function renderFrontmatter(fields: readonly FrontmatterField[]): string {
  return ["---", ...fields.flatMap(renderField), "---"].join("\n");
}

export function quoteYaml(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "\\n");

  return `"${escaped}"`;
}

function renderField(field: FrontmatterField): readonly string[] {
  if (Array.isArray(field.value)) {
    if (field.value.length === 0) {
      return [`${field.key}: []`];
    }

    return [`${field.key}:`, ...field.value.map((value) => `  - ${quoteYaml(value)}`)];
  }

  if (typeof field.value === "string") {
    return [`${field.key}: ${quoteYaml(field.value)}`];
  }

  return [`${field.key}: ${String(field.value)}`];
}
