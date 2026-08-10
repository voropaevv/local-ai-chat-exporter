import { render } from "preact";

import type { ConversationExport } from "../src/core/schema";
import { createLocalLibraryRecord, saveLocalLibraryRecord } from "../src/library/local-library";
import { OptionsApp } from "../src/ui/OptionsApp";
import { PopupApp } from "../src/ui/PopupApp";
import { PreviewApp } from "../src/ui/PreviewApp";
import "../src/ui/styles.css";

const conversation: ConversationExport = {
  completeness: {
    duplicateCount: 0,
    firstMessagePreview: "Create a concise launch checklist for Jelluvi.",
    lastMessagePreview: "The checklist is ready for review.",
    messageCount: 4,
    platformWarnings: [],
    reachedBottom: true,
    reachedTop: true,
    scrollSteps: 3,
    status: "complete",
    warnings: []
  },
  exportedAt: "2026-07-16T14:30:00.000Z",
  messageCount: 4,
  messages: [
    {
      attachments: [
        {
          description: "Markdown document",
          kind: "file",
          mimeType: "text/markdown",
          name: "launch-brief.md",
          sizeBytes: 18_420
        },
        {
          description: "ZIP archive",
          kind: "file",
          mimeType: "application/zip",
          name: "reference-assets.zip",
          sizeBytes: 3_480_000
        }
      ],
      authorLabel: "User",
      codeBlocks: [],
      id: "qa-user-1",
      images: [],
      index: 0,
      metadata: { displayTimestamp: "Thursday 9:52 AM" },
      role: "user",
      text: "Create a concise launch checklist for Jelluvi using the attached brief and reference assets."
    },
    {
      authorLabel: "ChatGPT",
      codeBlocks: [],
      id: "qa-assistant-1",
      images: [],
      index: 1,
      markdown:
        "## Launch priorities\n\nStart with **reliability** and preserve the conversation structure:\n\n- Verify capture completeness without duplicate scans.\n- Keep attached files visually distinct from the message body.\n- Render [Jelluvi documentation](https://example.com/jelluvi/docs) as a readable source link.\n\n> The export remains local and self-contained.",
      metadata: {},
      role: "assistant",
      sources: [
        {
          kind: "citation",
          snippet: "Local export, preview, and recovery guidance for the Jelluvi release.",
          title: "Jelluvi documentation",
          url: "https://example.com/jelluvi/docs"
        }
      ],
      text: "Launch priorities. Start with reliability and preserve the conversation structure. Verify capture completeness without duplicate scans.",
      thinkingBlocks: [
        {
          text: "Checked the brief, grouped the release gates, and removed repeated steps.",
          title: "Planning the checklist"
        }
      ]
    },
    {
      attachments: [
        {
          description: "Interactive HTML report",
          kind: "website",
          name: "release-dashboard.html",
          previewHtml:
            '<!doctype html><html><head><meta charset="utf-8"><style>:root{color-scheme:dark}body{margin:0;padding:28px;background:Canvas;color:CanvasText;font-family:system-ui}h1{margin:0 0 8px;font-size:28px}p{color:GrayText}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:24px}.card{border:1px solid GrayText;border-radius:14px;padding:18px;background:color-mix(in srgb,CanvasText 5%,Canvas)}.value{font-size:26px;font-weight:750;color:AccentColor}</style></head><body><h1>Release dashboard</h1><p>Static, self-contained artifact preview</p><div class="cards"><div class="card"><div class="value">86</div>messages</div><div class="card"><div class="value">8</div>formats</div><div class="card"><div class="value">0</div>remote calls</div></div></body></html>',
          url: "https://example.com/jelluvi/release-dashboard"
        }
      ],
      authorLabel: "User",
      codeBlocks: [],
      id: "qa-user-2",
      images: [],
      index: 2,
      metadata: {},
      role: "user",
      text: "Include the final visual and privacy checks, and keep the attached dashboard visible in Preview."
    },
    {
      authorLabel: "ChatGPT",
      codeBlocks: [{ code: "pnpm check", language: "sh" }],
      id: "qa-assistant-2",
      images: [],
      index: 3,
      markdown:
        "## Final checks\n\n1. Compare the dark and light Preview states.\n2. Confirm user prompts, files, sources, and code remain readable.\n3. Run the release checks:\n\n```sh\npnpm check\n```\n\nNo transcript upload is required.",
      metadata: {},
      role: "assistant",
      text: "Final checks. Compare dark and light Preview states, confirm rich content remains readable, then run pnpm check."
    }
  ],
  platform: "chatgpt",
  platformLabel: "ChatGPT",
  schemaVersion: "1.0",
  sourceUrl: "https://chatgpt.com/c/jelluvi-visual-qa",
  title: "Jelluvi launch checklist"
};

const scan = {
  completeness: conversation.completeness,
  messageCount: conversation.messageCount,
  platformLabel: conversation.platformLabel,
  scanId: "visual-qa-scan",
  sourceUrl: conversation.sourceUrl
};
const visualParams = new URLSearchParams(globalThis.location.search);
const qaStatus = visualParams.get("status") ?? "ready";
const qaTheme = visualParams.get("theme");

if (qaTheme === "light" || qaTheme === "dark") {
  globalThis.localStorage?.setItem("jelluvi/theme", qaTheme);
}

const batchTabs = [
  {
    id: 101,
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    title: "Launch checklist",
    url: "https://chatgpt.com/c/jelluvi-visual-qa"
  },
  {
    id: 102,
    platform: "claude",
    platformLabel: "Claude",
    title: "Provider comparison",
    url: "https://claude.ai/chat/jelluvi-visual-qa"
  },
  {
    id: 103,
    platform: "gemini",
    platformLabel: "Gemini",
    title: "Export notes",
    url: "https://gemini.google.com/app/jelluvi-visual-qa"
  }
] as const;

Object.assign(globalThis.chrome as unknown as Record<string, unknown>, {
  runtime: {
    getURL: (path: string) => (path === "brand/jelluvi.png" ? "/icons/icon-128.png" : `/${path}`),
    sendMessage: async (message: { readonly type?: string }) => {
      if (message.type === "jelluvi/get-active-tab-info") {
        if (qaStatus === "failed") {
          return {
            error: { code: "unsupported_platform", message: "Visual QA failure" },
            ok: false
          };
        }

        return {
          ok: true,
          value: {
            ...(qaStatus === "unsupported"
              ? { sourceUrl: "https://example.com/", supported: false }
              : {
                  platformLabel: conversation.platformLabel,
                  sourceUrl: conversation.sourceUrl,
                  supported: true
                })
          }
        };
      }

      if (message.type?.includes("get-scan-cache-summary")) {
        if (qaStatus !== "ready") {
          return { ok: true, value: { hasCache: false } };
        }

        return { ok: true, value: { hasCache: true, scan, scanId: "visual-qa-scan" } };
      }

      if (message.type?.includes("get-cached-conversation")) {
        return {
          ok: true,
          value: { conversation, hasConversation: true, scanId: "visual-qa-scan" }
        };
      }

      if (message.type === "jelluvi/list-open-chat-tabs") {
        return { ok: true, value: { tabs: batchTabs } };
      }

      if (message.type === "jelluvi/get-diagnostics") {
        return {
          ok: true,
          value: {
            dataPolicy: {
              conversationTextIncluded: false,
              sourceUrlIncluded: false,
              titleIncluded: false
            },
            extensionVersion: "0.2.2",
            generatedAt: "2026-07-18T14:30:00.000Z",
            provider: { id: "chatgpt", label: "ChatGPT" },
            recentErrors: [],
            scan: {
              completeness: {
                duplicateCount: 0,
                messageCount: 4,
                platformWarningCount: 0,
                reachedBottom: true,
                reachedTop: true,
                scrollSteps: 3,
                status: "complete",
                warningCount: 0
              },
              messageCount: 4,
              status: "ready"
            },
            schemaVersion: 1
          }
        };
      }

      return { ok: true, value: {} };
    }
  },
  permissions: {
    contains: (_permissions: unknown, callback: (granted: boolean) => void) => callback(true),
    request: (_permissions: unknown, callback: (granted: boolean) => void) => callback(true)
  },
  storage: {
    local: {
      get: (_key: string, callback: (items: Record<string, unknown>) => void) => callback({}),
      set: (_items: Record<string, unknown>, callback: () => void) => callback()
    }
  }
});

const root = document.getElementById("app");
const surface = visualParams.get("surface") ?? "popup";

prepareVisualState()
  .catch(() => undefined)
  .finally(() => {
    if (root !== null) {
      render(
        surface === "settings" ? (
          <OptionsApp />
        ) : surface === "preview" ? (
          <PreviewApp />
        ) : (
          <PopupApp />
        ),
        root
      );
    }
  });

async function prepareVisualState(): Promise<void> {
  if (visualParams.get("seedLibrary") !== "1") {
    return;
  }

  await saveLocalLibraryRecord(
    createLocalLibraryRecord(conversation, {
      projectLabel: "Release",
      savedAt: "2026-07-18T14:31:00.000Z",
      tags: ["qa", "launch"]
    })
  );
}
