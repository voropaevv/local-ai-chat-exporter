import { cleanText } from "../../utils/text";

export interface ExtractedTable {
  readonly rows: readonly (readonly string[])[];
  readonly markdown: string;
}

export function extractChatGptTables(root: Element): readonly ExtractedTable[] {
  const tables =
    root.tagName.toLocaleLowerCase() === "table"
      ? [root, ...Array.from(root.querySelectorAll("table"))]
      : Array.from(root.querySelectorAll("table"));

  return tables
    .map((table) => {
      const rows = extractTableRows(table);
      return {
        rows,
        markdown: tableToMarkdown(rows)
      };
    })
    .filter((table) => table.rows.length > 0 && table.markdown.length > 0);
}

export function tableElementToMarkdown(table: Element): string {
  return tableToMarkdown(extractTableRows(table));
}

export function extractTableRows(table: Element): readonly (readonly string[])[] {
  return Array.from(table.querySelectorAll("tr"))
    .map((row) =>
      Array.from(row.querySelectorAll("th,td")).map((cell) =>
        cleanTableCell(cleanText(cell.textContent ?? ""))
      )
    )
    .filter((row) => row.length > 0);
}

function tableToMarkdown(rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) {
    return "";
  }

  const width = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => normalizeRow(row, width));
  const [header, ...body] = normalizedRows;
  const divider = Array.from({ length: width }, () => "---");
  const renderedRows = [header, divider, ...body];

  return renderedRows.map(renderMarkdownRow).join("\n");
}

function normalizeRow(row: readonly string[], width: number): readonly string[] {
  return Array.from({ length: width }, (_unused, index) => row[index] ?? "");
}

function renderMarkdownRow(row: readonly string[]): string {
  return `| ${row.map(escapeMarkdownTableCell).join(" | ")} |`;
}

function cleanTableCell(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function escapeMarkdownTableCell(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, " ");
}
