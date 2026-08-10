import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";

import { detectChatGpt } from "../../../../src/adapters/chatgpt/detect";
import { extractVisibleChatGptMessages } from "../../../../src/adapters/chatgpt/extract-visible";
import { chatGptSelectors } from "../../../../src/adapters/chatgpt/selectors";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/chatgpt");

function loadFixture(name: string, url = "https://chatgpt.com/c/example"): Document {
  const html = readFileSync(resolve(fixturesDir, name), "utf8");
  return new JSDOM(html, { url }).window.document;
}

describe("detectChatGpt", () => {
  test("detects supported ChatGPT hosts", () => {
    expect(detectChatGpt({ hostname: "chatgpt.com" })).toBe(true);
    expect(detectChatGpt({ hostname: "chat.openai.com" })).toBe(true);
    expect(detectChatGpt({ hostname: "example.com" })).toBe(false);
  });

  test("detects ChatGPT-like DOM by stable message role attribute", () => {
    const document = loadFixture("simple-conversation.html", "https://example.com/local");

    expect(detectChatGpt({ document, hostname: "example.com" })).toBe(true);
  });
});

describe("extractVisibleChatGptMessages", () => {
  test("uses stable selectors for ChatGPT messages and turns", () => {
    expect(chatGptSelectors).toMatchObject({
      codeBlocks: "pre code, pre",
      conversationTurn: "[data-testid^='conversation-turn-']",
      markdownBody: ".markdown, [data-message-author-role]",
      messageByRole: "[data-message-author-role]"
    });
  });

  test("extracts user and assistant messages in document order", () => {
    const messages = extractVisibleChatGptMessages(loadFixture("simple-conversation.html"));

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages.map((message) => message.id)).toEqual(["user-msg-1", "assistant-msg-1"]);
    expect(messages.map((message) => message.index)).toEqual([0, 1]);
    expect(messages[0].text).toBe("Hello, can you summarize this?");
    expect(messages[1].text).toBe("Sure. Here is a concise summary.");
  });

  test("preserves code block whitespace and visible language", () => {
    const [message] = extractVisibleChatGptMessages(loadFixture("code-block.html"));

    expect(message.text).toContain("Use this TypeScript:");
    expect(message.text).not.toContain("Copy code");
    expect(message.codeBlocks).toEqual([
      {
        language: "ts",
        code: "  const value = 1;\n\n  console.log(value);\n"
      }
    ]);
  });

  test("keeps multiple nested-pre code blocks aligned without collapsing legitimate repeats", () => {
    const document = new JSDOM(
      `<main>
        <section data-testid="conversation-turn-nested-code">
          <div data-message-author-role="assistant" data-message-id="nested-code">
            <div class="markdown">
              <p>Run the first command.</p>
              <div data-code-block="first"></div>
              <p>Run the same command again.</p>
              <div data-code-block="repeat"></div>
              <p>Then run the final command.</p>
              <div data-code-block="final"></div>
            </div>
          </div>
        </section>
      </main>`,
      { url: "https://chatgpt.com/c/nested-code" }
    ).window.document;

    const codeByBlock = new Map([
      ["first", "make verify\n"],
      ["repeat", "make verify\n"],
      ["final", "uname -m\n"]
    ]);

    for (const [blockId, codeText] of codeByBlock) {
      const host = document.querySelector(`[data-code-block='${blockId}']`);
      const outerPre = document.createElement("pre");
      const innerPre = document.createElement("pre");
      const code = document.createElement("code");

      code.textContent = codeText;
      innerPre.append(code);
      outerPre.append(innerPre);
      host?.append(outerPre);
    }

    const [message] = extractVisibleChatGptMessages(document);
    const markdown = message.markdown ?? "";

    expect(message.codeBlocks.map((block) => block.code)).toEqual([
      "make verify\n",
      "make verify\n",
      "uname -m\n"
    ]);
    expect(markdown.match(/```/g)).toHaveLength(6);
    expect(markdown.match(/make verify/g)).toHaveLength(2);
    expect(markdown.match(/uname -m/g)).toHaveLength(1);
    expect(markdown.indexOf("uname -m")).toBeGreaterThan(markdown.lastIndexOf("make verify"));
  });

  test("captures the live main generated download beside four file entities", () => {
    const document = new JSDOM(
      `<main>
        <section data-testid="conversation-turn-generated-files">
          <div data-message-author-role="assistant" data-message-id="generated-files">
            <div class="markdown">
              <p>Generated files:</p>
              <p data-end="74" data-start="12">
                <span data-state="closed">
                  <button
                    class="behavior-btn hover:entity-accent focus-visible:focus-ring entity-underline inline cursor-pointer appearance-none border-0 bg-transparent p-0 text-start align-baseline text-inherit"
                    type="button"
                  >Скачать Social Video Downloader для macOS — исходный проект ZIP</button>
                </span>
              </p>
              <ul>
                <li>
                  <p role="presentation">
                    <button
                      class="behavior-btn entity-underline text-token-text-link"
                      type="button"
                    >
                      <span>Готовая задача для Codex</span>
                    </button>
                  </p>
                </li>
                <li>
                  <p role="presentation">
                    <button
                      class="behavior-btn entity-underline text-token-text-link"
                      type="button"
                    >
                      <span>Описание архитектуры</span>
                    </button>
                  </p>
                </li>
                <li>
                  <p role="presentation">
                    <button
                      class="behavior-btn entity-underline text-token-text-link"
                      type="button"
                    >
                      <span>README и команды запуска</span>
                    </button>
                  </p>
                </li>
                <li>
                  <p role="presentation">
                    <button
                      class="behavior-btn entity-underline text-token-text-link"
                      type="button"
                    >
                      <span>Контрольная сумма SHA-256</span>
                    </button>
                  </p>
                </li>
              </ul>
              <p>
                <button
                  class="behavior-btn entity-underline inline text-inherit"
                  type="button"
                >Open settings</button>
                <button
                  class="behavior-btn entity-underline inline text-inherit"
                  type="button"
                >Download documentation</button>
                <button
                  aria-label="Example citation"
                  class="behavior-btn entity-underline inline text-inherit"
                  type="button"
                >Example source</button>
              </p>
              <p><a href="https://example.com/docs">Regular documentation</a></p>
            </div>
          </div>
        </section>
      </main>`,
      { url: "https://chatgpt.com/c/generated-files" }
    ).window.document;

    const [message] = extractVisibleChatGptMessages(document);

    expect(message.attachments).toEqual([
      {
        kind: "file",
        name: "Social Video Downloader для macOS — исходный проект ZIP"
      },
      {
        kind: "file",
        name: "Готовая задача для Codex"
      },
      {
        kind: "file",
        name: "Описание архитектуры"
      },
      {
        kind: "file",
        name: "README и команды запуска"
      },
      {
        kind: "file",
        name: "Контрольная сумма SHA-256"
      }
    ]);
    expect(message.markdown).toContain("[Regular documentation](https://example.com/docs)");
    expect(message.attachments).toHaveLength(5);
    expect(message.attachments?.every((attachment) => attachment.url === undefined)).toBe(true);
    expect(message.markdown).not.toMatch(/^\s*-\s*$/m);
  });

  test("retains generated file labels without leaking unsafe download URLs", () => {
    const document = new JSDOM(
      `<section data-testid="conversation-turn-unsafe-download">
        <div data-message-author-role="assistant" data-message-id="unsafe-download">
          <div class="markdown">
            <a download="payload.zip" href="javascript:window.evil()">Download payload.zip</a>
          </div>
        </div>
      </section>`,
      { url: "https://chatgpt.com/c/unsafe-download" }
    ).window.document;
    const [message] = extractVisibleChatGptMessages(document);

    expect(message.attachments).toEqual([
      {
        description: "Download payload.zip",
        kind: "file",
        name: "payload.zip"
      }
    ]);
    expect(message.markdown).not.toContain("javascript:");
  });

  test("keeps table HTML and visible table text", () => {
    const [message] = extractVisibleChatGptMessages(loadFixture("table.html"));

    expect(message.text).toContain("Comparison:");
    expect(message.text).toContain("Markdown");
    expect(message.text).toContain("Archive");
    expect(message.html).toContain("<table>");
  });

  test("preserves LaTeX-like text without interpreting it", () => {
    const [message] = extractVisibleChatGptMessages(loadFixture("math.html"));

    expect(message.text).toContain("\\(E = mc^2\\)");
    expect(message.text).toContain("$$a^2 + b^2 = c^2$$");
  });

  test("removes UI-only controls from text and sanitized HTML", () => {
    const [message] = extractVisibleChatGptMessages(loadFixture("buttons.html"));

    expect(message.text).toBe("Final answer text.");
    expect(message.html).not.toContain("<button");
    expect(message.html).not.toContain("<svg");
    expect(message.html).not.toContain("Screen reader control label");
  });

  test("extracts image references without fetching image content", () => {
    const [message] = extractVisibleChatGptMessages(loadFixture("image.html"));

    expect(message.images).toEqual([
      {
        alt: "Architecture diagram",
        height: 360,
        src: "blob:https://chatgpt.com/local-image",
        width: 640
      }
    ]);
    expect(message.text).toContain("Here is the diagram.");
  });

  test("extracts advanced ChatGPT content without leaking thinking into the body", () => {
    const messages = extractVisibleChatGptMessages(loadFixture("advanced-content.html"));

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      authorLabel: "Ava Researcher",
      createdAt: "2026-06-01T10:00:00.000Z",
      participant: "Ava Researcher",
      role: "user"
    });

    const assistant = messages[1];

    expect(assistant).toMatchObject({
      createdAt: "2026-06-01T10:05:00.000Z",
      model: "GPT-4o Deep Research",
      metadata: { contentKind: "deep_research" }
    });
    expect(assistant.markdown).toContain("| Variant | Evidence |");
    expect(assistant.markdown).toContain("\\(p < 0.05\\)");
    expect(assistant.codeBlocks[0]).toEqual({
      code: 'const risk = "moderate";\nconsole.log(risk);\n',
      language: "ts"
    });
    expect(assistant.text).not.toContain("Need to compare source quality");
    expect(assistant.markdown).not.toContain("Need to compare source quality");
    expect(assistant.sources).toEqual([
      {
        id: "dr-citation-1",
        kind: "deep_research",
        snippet: "Genome Paper Peer-reviewed source for the Deep Research report.",
        title: "Genome Paper",
        url: "https://example.org/genome-paper"
      },
      {
        id: "web-source-1",
        kind: "web_search",
        snippet: "Current Guidance Web Search source captured from visible source links.",
        title: "Current Guidance",
        url: "https://example.com/current-guidance"
      }
    ]);
    expect(assistant.thinkingBlocks).toEqual([
      {
        text: "Need to compare source quality before finalizing.",
        title: "Thinking"
      }
    ]);
    expect(assistant.canvas).toEqual([
      {
        title: "Canvas draft",
        url: "https://chatgpt.com/canvas/local-canvas",
        warning:
          "Canvas content was detected but could not be extracted from the current DOM. Open the canvas link or capture it manually."
      }
    ]);
  });

  test("extracts file cards separately from user text and keeps attachment-only messages", () => {
    const messages = extractVisibleChatGptMessages(loadFixture("attachments-and-artifact.html"));

    expect(messages).toHaveLength(4);
    expect(messages[0].text).toBe("Find the most relevant roles from the attached files.");
    expect(messages[0].text).not.toContain("Zip Archive");
    expect(messages[0].text).not.toContain("VladOS");
    expect(messages[0].images).toEqual([]);
    expect(messages[0].attachments).toEqual([
      {
        description: "Markdown file",
        id: "file-md",
        kind: "file",
        mimeType: "text/markdown",
        name: "Pasted markdown(16).md",
        sizeBytes: 2048
      },
      {
        description: "Zip Archive",
        id: "file-zip",
        kind: "file",
        mimeType: "application/zip",
        name: "Archive(4).zip",
        sizeBytes: 1_572_864
      }
    ]);

    expect(messages[1]).toMatchObject({
      attachments: [
        {
          id: "file-only",
          kind: "file",
          mimeType: "text/plain",
          name: "notes.txt"
        }
      ],
      id: "attachment-only",
      text: ""
    });

    expect(messages[2].attachments).toHaveLength(1);
    const [artifact] = messages[2].attachments ?? [];
    expect(artifact).toMatchObject({
      id: "artifact-html",
      kind: "website",
      mimeType: "text/html",
      name: "dashboard.html"
    });
    expect(artifact?.previewHtml).toContain("<h1>Local dashboard</h1>");
    expect(artifact?.previewHtml).toContain("Portable content");
    expect(artifact?.previewHtml).not.toContain("<script");
    expect(artifact?.previewHtml).not.toContain("onload");
    expect(artifact?.previewHtml).not.toContain("https://tracker.example");
    expect(artifact?.previewHtml).not.toContain('href="https://example.com"');

    expect(messages[3].attachments?.[0]).toMatchObject({
      id: "artifact-remote",
      kind: "website",
      name: "remote-dashboard.html",
      url: "https://example.com/remote-dashboard",
      warning:
        "The embedded preview could not be captured as a portable local snapshot. Open the original conversation to view it."
    });
    expect(messages[3].attachments?.[0]?.previewHtml).toBeUndefined();
  });

  test("extracts current file tiles, timestamps, and a final answer beside rich activity", () => {
    const messages = extractVisibleChatGptMessages(
      loadFixture("current-file-tiles-rich-activity.html")
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      attachments: [
        {
          description: "File",
          kind: "file",
          name: "Pasted markdown(16).md"
        },
        {
          description: "Zip Archive",
          kind: "file",
          name: "Archive(4).zip"
        }
      ],
      metadata: {
        displayTimestamp: "Thursday 9:52 AM"
      },
      role: "user",
      text: "Find the most relevant roles from all attached files."
    });
    expect(messages[0].createdAt).toBeUndefined();
    expect(messages[0].text).not.toContain("Zip Archive");

    expect(messages[1]).toMatchObject({
      createdAt: "2026-07-23T10:46:00+04:00",
      metadata: {
        displayTimestamp: "Thursday 10:46 AM"
      },
      role: "assistant"
    });
    expect(messages[1].text).toContain("Итог");
    expect(messages[1].text).toContain("Я собрал полный список");
    expect(messages[1].text).not.toContain("Analysis errored");
    expect(messages[1].markdown).toContain("- 132 вакансии");
    expect(messages[1].codeBlocks).toEqual([]);
    expect(messages[1].thinkingBlocks).toHaveLength(1);
    expect(messages[1].thinkingBlocks?.[0]).toMatchObject({
      title: "Analyzed"
    });
    expect(messages[1].thinkingBlocks?.[0]?.text).toContain("Analysis errored");
    expect(messages[1].thinkingBlocks?.[0]?.text).toContain("STDOUT/STDERR");
    expect(messages[1].thinkingBlocks?.[0]?.text).not.toContain("Я собрал полный список");
  });

  test("re-extracts a stable message when its preceding display timestamp hydrates late", () => {
    const document = new JSDOM(
      `<main>
        <section data-testid="conversation-turn-1">
          <div data-message-author-role="user" data-message-id="late-timestamp">
            <div class="markdown"><p>Hello after hydration.</p></div>
          </div>
        </section>
      </main>`,
      { url: "https://chatgpt.com/c/late-timestamp" }
    ).window.document;
    const revisions = new Map<string, string>();
    const firstPass = extractVisibleChatGptMessages(document, {
      onStableMessageRevision: (messageId, revision) => revisions.set(messageId, revision)
    });
    const turn = document.querySelector("[data-testid='conversation-turn-1']");
    const separator = document.createElement("div");

    separator.setAttribute("aria-label", "Thursday 9:52 AM");
    separator.setAttribute("role", "separator");
    turn?.before(separator);

    const secondPass = extractVisibleChatGptMessages(document, {
      knownStableMessageRevisions: revisions
    });

    expect(firstPass[0]?.metadata.displayTimestamp).toBeUndefined();
    expect(secondPass).toHaveLength(1);
    expect(secondPass[0]?.metadata.displayTimestamp).toBe("Thursday 9:52 AM");
  });

  test("does not mistake a time element inside message content for the message date", () => {
    const document = new JSDOM(
      `<section data-testid="conversation-turn-1">
        <div data-message-author-role="assistant" data-message-id="content-time">
          <div class="markdown">
            <p>The deadline is <time datetime="2027-01-02T12:00:00Z">2 January</time>.</p>
          </div>
        </div>
      </section>`,
      { url: "https://chatgpt.com/c/content-time" }
    ).window.document;
    const [message] = extractVisibleChatGptMessages(document);

    expect(message?.createdAt).toBeUndefined();
    expect(message?.metadata.displayTimestamp).toBeUndefined();
  });

  test("hard-bounds captured local artifact HTML", () => {
    const longBody = "x".repeat(300_000);
    const document = new JSDOM(
      `<article data-testid="conversation-turn-1">
        <div data-message-author-role="assistant" data-message-id="bounded-artifact"></div>
        <section data-file-name="bounded.html" data-testid="artifact-card">
          <iframe srcdoc="<main>${longBody}</main>"></iframe>
        </section>
      </article>`,
      { url: "https://chatgpt.com/c/bounded-artifact" }
    ).window.document;
    const [message] = extractVisibleChatGptMessages(document);

    expect(message.attachments?.[0]?.previewHtml?.length).toBeLessThanOrEqual(250_000);
  });

  test("captures and sanitizes an accessible same-origin HTTPS iframe document", () => {
    const document = new JSDOM(
      `<article data-testid="conversation-turn-1">
        <div data-message-author-role="assistant" data-message-id="same-origin-artifact"></div>
        <section data-file-name="same-origin.html" data-testid="artifact-card">
          <iframe src="https://chatgpt.com/backend-api/files/same-origin.html"></iframe>
        </section>
      </article>`,
      { url: "https://chatgpt.com/c/same-origin-artifact" }
    ).window.document;
    const iframe = document.querySelector<HTMLIFrameElement>("iframe");

    if (iframe === null) {
      throw new Error("fixture missing same-origin iframe");
    }

    const iframeDocument = new JSDOM(
      `<!doctype html><html><body>
        <h1>Same-origin dashboard</h1>
        <script>window.evil()</script>
        <img src="https://tracker.example/pixel.png">
      </body></html>`,
      { url: iframe.src }
    ).window.document;

    Object.defineProperty(iframe, "contentDocument", {
      configurable: true,
      value: iframeDocument
    });

    const [message] = extractVisibleChatGptMessages(document);
    const [attachment] = message.attachments ?? [];

    expect(attachment).toMatchObject({
      kind: "website",
      name: "same-origin.html",
      url: "https://chatgpt.com/backend-api/files/same-origin.html"
    });
    expect(attachment.previewHtml).toContain("Same-origin dashboard");
    expect(attachment.previewHtml).not.toContain("<script");
    expect(attachment.previewHtml).not.toContain("tracker.example");
    expect(attachment.warning).toBeUndefined();
  });

  test("falls back to a portable warning when iframe document access is denied", () => {
    const document = new JSDOM(
      `<article data-testid="conversation-turn-1">
        <div data-message-author-role="assistant" data-message-id="cross-origin-artifact"></div>
        <section data-file-name="cross-origin.html" data-testid="artifact-card">
          <iframe src="https://artifacts.example/cross-origin.html"></iframe>
        </section>
      </article>`,
      { url: "https://chatgpt.com/c/cross-origin-artifact" }
    ).window.document;
    const iframe = document.querySelector<HTMLIFrameElement>("iframe");

    if (iframe === null) {
      throw new Error("fixture missing cross-origin iframe");
    }

    Object.defineProperty(iframe, "contentDocument", {
      configurable: true,
      get: () => {
        throw new DOMException("Blocked by same-origin policy", "SecurityError");
      }
    });

    const [message] = extractVisibleChatGptMessages(document);
    const [attachment] = message.attachments ?? [];

    expect(attachment.previewHtml).toBeUndefined();
    expect(attachment.warning).toBe(
      "The embedded preview could not be captured as a portable local snapshot. Open the original conversation to view it."
    );
  });

  test("preserves rich Markdown and captures only visible turn-linked activity", () => {
    const [message] = extractVisibleChatGptMessages(
      loadFixture("current-rich-sources-activity.html")
    );

    expect(message.markdown).toContain("## Summary");
    expect(message.markdown).toContain("**Applied AI:**");
    expect(message.markdown).toContain("*high priority*");
    expect(message.markdown).toContain("- **First:** preserve the list.");
    expect(message.markdown).toContain("  1. Nested one");
    expect(message.markdown).toContain("> Keep this visible quote.");
    expect(message.markdown).toContain(
      "[jobs.ashbyhq.com +1](https://jobs.ashbyhq.com/example/role?utm_source=chatgpt.com#details)"
    );
    expect(message.markdown).not.toContain("Image: [Image]");
    expect(message.images).toEqual([]);
    expect(message.sources).toHaveLength(1);
    expect(message.sources?.[0]).toMatchObject({
      id: "source-inline",
      kind: "deep_research",
      title: "Example AI Role",
      url: "https://jobs.ashbyhq.com/example/role"
    });
    expect(message.sources?.[0]?.snippet?.length).toBeLessThanOrEqual(280);
    expect(message.thinkingBlocks).toEqual([
      {
        text: "Inspected project files and compared source quality.",
        title: "Activity"
      }
    ]);
    expect(message.thinkingBlocks?.[0]?.text).not.toContain("hidden reasoning");
    expect(message.text).not.toContain("A concise source card");
    expect(message.text).not.toContain("Worked for 54m");
    expect(message.markdown).not.toContain("Worked for 54m");
  });

  test("does not turn a regular answer list item into a source snippet", () => {
    const document = new JSDOM(
      `<article data-testid="conversation-turn-source">
        <div data-message-author-role="assistant" data-message-id="answer-source">
          <ul>
            <li>
              Keep this answer text separate from the source.
              <a
                aria-label="Example source"
                data-source-id="inline-source"
                href="https://example.com/inline-source"
              >Example source</a>
            </li>
          </ul>
        </div>
      </article>`,
      { url: "https://chatgpt.com/c/source-snippet" }
    ).window.document;
    const [message] = extractVisibleChatGptMessages(document);

    expect(message.sources).toEqual([
      {
        id: "inline-source",
        kind: "citation",
        title: "Example source",
        url: "https://example.com/inline-source"
      }
    ]);
  });

  test("extracts accessible anonymous ChatGPT-like conversations without account state", () => {
    const messages = extractVisibleChatGptMessages(
      loadFixture("advanced-content.html", "https://example.com/share/local")
    );

    expect(messages.map((message) => message.id)).toEqual([
      "user-advanced-1",
      "assistant-advanced-1"
    ]);
  });
});
