import type { LocalRendererFormat } from "../renderers/types";
import type { ChatPlatform } from "./schema";

export interface BatchTabLike {
  readonly id?: number;
  readonly title?: string;
  readonly url?: string;
}

type BatchPlatform = Exclude<ChatPlatform, "unknown">;

export interface BatchCandidateTab {
  readonly id: number;
  readonly platform: BatchPlatform;
  readonly platformLabel: string;
  readonly title: string;
  readonly url: string;
}

export interface BatchManifestFile {
  readonly filename: string;
  readonly format: LocalRendererFormat;
  readonly hash?: string;
  readonly mimeType: string;
  readonly size?: number;
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
  readonly generatedBy: "jelluvi";
  readonly resultCount: number;
  readonly rootDirectory: string;
  readonly results: readonly BatchManifestResult[];
}

export type BatchManifestResult =
  | {
      readonly files: readonly BatchManifestFile[];
      readonly messageCount: number;
      readonly platform: BatchPlatform;
      readonly status: "success";
      readonly tabId: number;
      readonly title: string;
      readonly url: string;
      readonly warnings: readonly string[];
    }
  | {
      readonly error: string;
      readonly platform: BatchPlatform;
      readonly status: "failed";
      readonly tabId: number;
      readonly title: string;
      readonly url: string;
      readonly warnings: readonly string[];
    };

interface BatchPlatformConfig {
  readonly hostnames: readonly string[];
  readonly label: string;
  readonly origins: Readonly<Record<string, string>>;
  readonly platform: BatchPlatform;
}

const BATCH_PLATFORM_CONFIGS: readonly BatchPlatformConfig[] = [
  {
    hostnames: ["chatgpt.com", "chat.openai.com"],
    label: "ChatGPT",
    origins: {
      "chatgpt.com": "https://chatgpt.com/*",
      "chat.openai.com": "https://chat.openai.com/*"
    },
    platform: "chatgpt"
  },
  {
    hostnames: ["claude.ai"],
    label: "Claude",
    origins: {
      "claude.ai": "https://claude.ai/*"
    },
    platform: "claude"
  },
  {
    hostnames: ["gemini.google.com"],
    label: "Gemini",
    origins: {
      "gemini.google.com": "https://gemini.google.com/*"
    },
    platform: "gemini"
  },
  {
    hostnames: ["www.perplexity.ai", "perplexity.ai"],
    label: "Perplexity",
    origins: {
      "perplexity.ai": "https://perplexity.ai/*",
      "www.perplexity.ai": "https://www.perplexity.ai/*"
    },
    platform: "perplexity"
  },
  {
    hostnames: ["notebooklm.google.com"],
    label: "NotebookLM",
    origins: {
      "notebooklm.google.com": "https://notebooklm.google.com/*"
    },
    platform: "notebooklm"
  }
];

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
        platform: platform.platform,
        platformLabel: platform.label,
        title: tab.title?.trim() || "Untitled chat",
        url: tab.url
      }
    ];
  });
}

export function createBatchRootDirectory(exportedAt: string): string {
  return `jelluvi-${exportedAt.slice(0, 10)}`;
}

export function createBatchEntryBase(tab: BatchCandidateTab, index: number): string {
  return `${tab.platform}-${slugify(tab.title)}-${index + 1}`;
}

export function getBatchRequiredOrigins(tab: Pick<BatchCandidateTab, "url">): readonly string[] {
  const config = detectBatchPlatform(tab.url);

  if (config === undefined) {
    return [];
  }

  try {
    const hostname = new URL(tab.url).hostname;
    const origin = config.origins[hostname];

    return origin === undefined ? [] : [origin];
  } catch {
    return [];
  }
}

export function getBatchRequiredOriginsForTabs(
  tabs: readonly Pick<BatchCandidateTab, "url">[]
): readonly string[] {
  return [...new Set(tabs.flatMap((tab) => getBatchRequiredOrigins(tab)))];
}

export function createBatchManifest(input: BatchManifestInput): BatchManifest {
  return {
    exportedAt: input.exportedAt,
    generatedBy: "jelluvi",
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

function detectBatchPlatform(url: string): BatchPlatformConfig | undefined {
  try {
    const parsed = new URL(url);

    return BATCH_PLATFORM_CONFIGS.find((config) => config.hostnames.includes(parsed.hostname));
  } catch {
    return undefined;
  }
}

function slugify(value: string): string {
  const slug = value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return slug.length > 0 ? slug : "untitled-chat";
}
