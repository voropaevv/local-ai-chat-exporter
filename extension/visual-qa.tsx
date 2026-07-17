import { render } from "preact";

import type { ConversationExport } from "../src/core/schema";
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
      authorLabel: "User",
      codeBlocks: [],
      id: "qa-user-1",
      images: [],
      index: 0,
      metadata: {},
      role: "user",
      text: "Create a concise launch checklist for Jelluvi."
    },
    {
      authorLabel: "ChatGPT",
      codeBlocks: [],
      id: "qa-assistant-1",
      images: [],
      index: 1,
      markdown:
        "Start with reliability: verify capture completeness, local exports, and recovery states.",
      metadata: {},
      role: "assistant",
      text: "Start with reliability: verify capture completeness, local exports, and recovery states."
    },
    {
      authorLabel: "User",
      codeBlocks: [],
      id: "qa-user-2",
      images: [],
      index: 2,
      metadata: {},
      role: "user",
      text: "Include the final visual and privacy checks."
    },
    {
      authorLabel: "ChatGPT",
      codeBlocks: [{ code: "pnpm check", language: "sh" }],
      id: "qa-assistant-2",
      images: [],
      index: 3,
      markdown:
        "The checklist is ready for review.\n\n```sh\npnpm check\n```\n\nNo transcript upload is required.",
      metadata: {},
      role: "assistant",
      text: "The checklist is ready for review. pnpm check. No transcript upload is required."
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

      return { ok: true, value: {} };
    }
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

if (root !== null) {
  render(
    surface === "settings" ? <OptionsApp /> : surface === "preview" ? <PreviewApp /> : <PopupApp />,
    root
  );
}
