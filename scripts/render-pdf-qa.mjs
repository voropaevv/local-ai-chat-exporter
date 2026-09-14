import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "qa-artifacts/pdf");
const server = await createServer({
  configFile: false,
  root,
  assetsInclude: ["**/*.zlib"],
  server: { middlewareMode: true }
});
try {
  const { renderPdfFromNormalizedConversation } =
    await server.ssrLoadModule("/src/renderers/pdf.ts");
  const markdown = [
    "## Отступы и нумерованный список",
    "1. **Быстрее находить события.**\nОписание должно оставаться выровненным с текстом пункта.\n2. **Использовать существующие камеры.**\nВторая строка пояснения.",
    "---\n## Заголовок после разделителя",
    "**9 → 10 → 11 → 12 → 13 → 14.**",
    "> **Что снимать → как это выглядит → сколько раз.**\n> Вторая строка цитаты должна иметь одинаковый отступ от границ.",
    "| Этап | Описание | Балл |\n| --- | --- | --- |\n| 5. Масштабирование | Автоматизация и проверка результата | 3/10 |\n| Проверка | " +
      "ДлинноеСловоБезПробелов".repeat(8) +
      " | 10/10 |",
    "**Текст под таблицей не должен пересекать нижнюю границу.**",
    "```text\nproject/\n├── README.md\n├── docs/\n│   ├── PROJECT.md\n│   └── DATASET.md\n└── tests/\n```",
    "```text\nНЕ:\nПример короткого блока\n```",
    "## Многостраничный блок кода",
    "```text\n" +
      Array.from(
        { length: 85 },
        (_, i) => `${i + 1}. Проверка фона на каждой странице: строка данных`
      ).join("\n") +
      "\n```",
    "## Многостраничная цитата\n" +
      Array.from(
        { length: 65 },
        (_, i) => `> Строка ${i + 1}. Проверка вертикальной границы цитаты и нижнего отступа.`
      ).join("\n"),
    "## Символы\n✅ 📁 🚀 ≤ ≥ ≠ → ← ↔"
  ].join("\n\n");
  const conversation = {
    schemaVersion: "1.0",
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    messageCount: 1,
    title: "Проверка PDF",
    sourceUrl: "https://chatgpt.com/c/synthetic-pdf-qa",
    exportedAt: "2026-09-11T00:00:00Z",
    messages: [
      {
        id: "synthetic",
        index: 0,
        role: "assistant",
        authorLabel: "ChatGPT",
        text: markdown,
        markdown,
        codeBlocks: [],
        images: [],
        metadata: {}
      }
    ],
    completeness: {
      status: "complete",
      warnings: [],
      platformWarnings: [],
      messageCount: 1,
      reachedTop: true,
      reachedBottom: true,
      scrollSteps: 0,
      duplicateCount: 0
    }
  };
  await mkdir(output, { recursive: true });
  for (const template of ["light", "dark"]) {
    const file = renderPdfFromNormalizedConversation(conversation, {
      pdfSettings: { template },
      includeMetadata: false
    });
    if (file.format !== "pdf" || !(file.bytes instanceof Uint8Array))
      throw new Error("PDF generation fell back");
    await writeFile(resolve(output, `layout-${template}.pdf`), file.bytes);
  }
  console.log(`Rendered synthetic PDF fixtures into ${output}`);
} finally {
  await server.close();
}
