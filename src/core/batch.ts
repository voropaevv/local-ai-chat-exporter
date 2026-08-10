import type { LocalRendererFormat } from "../renderers/types";
import {
  getProviderByUrl,
  getProviderDefinition,
  getProviderOriginForUrl,
  SUPPORTED_CHAT_ORIGINS,
  type ProviderId
} from "./provider-catalog";

export interface BatchTabLike {
  readonly id?: number;
  readonly title?: string;
  readonly url?: string;
}

type BatchPlatform = ProviderId;

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

export interface SupportedChatPageInfo {
  readonly label: string;
  readonly platform: BatchPlatform;
}

export { SUPPORTED_CHAT_ORIGINS } from "./provider-catalog";

export const CHATGPT_CHAT_ORIGINS: readonly string[] = [
  ...getProviderDefinition("chatgpt").origins
];

export function getAllowedBatchDiscoveryOrigins(
  requestedOrigins: readonly string[]
): readonly string[] {
  const allowedOrigins = new Set(SUPPORTED_CHAT_ORIGINS);

  return [...new Set(requestedOrigins.filter((origin) => allowedOrigins.has(origin)))];
}

export function getBatchCandidateTabs(tabs: readonly BatchTabLike[]): readonly BatchCandidateTab[] {
  return tabs.flatMap((tab) => {
    if (tab.id === undefined || tab.url === undefined) {
      return [];
    }

    const provider = getProviderByUrl(tab.url);

    if (provider === undefined) {
      return [];
    }

    return [
      {
        id: tab.id,
        platform: provider.id,
        platformLabel: provider.label,
        title: tab.title?.trim() || "Untitled chat",
        url: tab.url
      }
    ];
  });
}

export function getSupportedChatPageInfo(url: string): SupportedChatPageInfo | undefined {
  const provider = getProviderByUrl(url);

  return provider === undefined ? undefined : { label: provider.label, platform: provider.id };
}

export function createBatchRootDirectory(exportedAt: string): string {
  return `jelluvi-${exportedAt.slice(0, 10)}`;
}

export function createBatchEntryBase(tab: BatchCandidateTab, index: number): string {
  return `${tab.platform}-${slugify(tab.title)}-${index + 1}`;
}

export function getBatchRequiredOrigins(tab: Pick<BatchCandidateTab, "url">): readonly string[] {
  const origin = getProviderOriginForUrl(tab.url);

  return origin === undefined ? [] : [origin];
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

function slugify(value: string): string {
  const slug = value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return slug.length > 0 ? slug : "untitled-chat";
}
