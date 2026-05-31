import type { LocalRendererFormat } from "../renderers/types";
import type { ChatPlatform } from "./schema";

export interface BatchTabLike {
  readonly id?: number;
  readonly title?: string;
  readonly url?: string;
}

export interface BatchCandidateTab {
  readonly id: number;
  readonly platform: Extract<ChatPlatform, "chatgpt">;
  readonly platformLabel: "ChatGPT";
  readonly title: string;
  readonly url: string;
}

export interface BatchManifestFile {
  readonly filename: string;
  readonly format: LocalRendererFormat;
  readonly mimeType: string;
}

export interface BatchExportSuccess {
  readonly files: readonly BatchManifestFile[];
  readonly messageCount: number;
  readonly status: "success";
  readonly tab: BatchCandidateTab;
  readonly warnings: readonly string[];
}

export interface BatchExportFailure {
  readonly error: string;
  readonly status: "failed";
  readonly tab: BatchCandidateTab;
  readonly warnings: readonly string[];
}

export type BatchExportResult = BatchExportSuccess | BatchExportFailure;

export interface BatchManifestInput {
  readonly exportedAt: string;
  readonly results: readonly BatchExportResult[];
  readonly rootDirectory: string;
}

export interface BatchManifest {
  readonly exportedAt: string;
  readonly generatedBy: "local-ai-chat-exporter";
  readonly resultCount: number;
  readonly rootDirectory: string;
  readonly results: readonly BatchManifestResult[];
}

export type BatchManifestResult =
  | {
      readonly files: readonly BatchManifestFile[];
      readonly messageCount: number;
      readonly platform: BatchCandidateTab["platform"];
      readonly status: "success";
      readonly tabId: number;
      readonly title: string;
      readonly url: string;
      readonly warnings: readonly string[];
    }
  | {
      readonly error: string;
      readonly platform: BatchCandidateTab["platform"];
      readonly status: "failed";
      readonly tabId: number;
      readonly title: string;
      readonly url: string;
      readonly warnings: readonly string[];
    };

export function getBatchCandidateTabs(tabs: readonly BatchTabLike[]): readonly BatchCandidateTab[] {
  return tabs.flatMap((tab) => {
    if (tab.id === undefined || tab.url === undefined) {
      return [];
    }

    const platform = detectBatchPlatform(tab.url);

    if (platform === undefined) {
      return [];
    }

    return [
      {
        id: tab.id,
        platform,
        platformLabel: "ChatGPT",
        title: tab.title?.trim() || "Untitled chat",
        url: tab.url
      }
    ];
  });
}

export function createBatchRootDirectory(exportedAt: string): string {
  return `local-ai-chat-export-${exportedAt.slice(0, 10)}`;
}

export function createBatchEntryBase(tab: BatchCandidateTab, index: number): string {
  return `${tab.platform}-${slugify(tab.title)}-${index + 1}`;
}

export function createBatchManifest(input: BatchManifestInput): BatchManifest {
  return {
    exportedAt: input.exportedAt,
    generatedBy: "local-ai-chat-exporter",
    resultCount: input.results.length,
    rootDirectory: input.rootDirectory,
    results: input.results.map((result) => {
      if (result.status === "success") {
        return {
          files: result.files,
          messageCount: result.messageCount,
          platform: result.tab.platform,
          status: result.status,
          tabId: result.tab.id,
          title: result.tab.title,
          url: result.tab.url,
          warnings: result.warnings
        };
      }

      return {
        error: result.error,
        platform: result.tab.platform,
        status: result.status,
        tabId: result.tab.id,
        title: result.tab.title,
        url: result.tab.url,
        warnings: result.warnings
      };
    })
  };
}

function detectBatchPlatform(url: string): BatchCandidateTab["platform"] | undefined {
  try {
    const parsed = new URL(url);

    if (parsed.hostname === "chatgpt.com" || parsed.hostname === "chat.openai.com") {
      return "chatgpt";
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function slugify(value: string): string {
  const slug = value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return slug.length > 0 ? slug : "untitled-chat";
}
