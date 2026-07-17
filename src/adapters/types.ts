import type {
  ProviderCapabilities,
  ProviderId,
  ProviderSupportStatus
} from "../core/provider-catalog";
import type { ExportedMessage } from "../core/schema";

export type SupportedChatPlatform = ProviderId;
export type { ProviderSupportStatus } from "../core/provider-catalog";

export interface AdapterDetectionContext {
  readonly document?: ParentNode;
  readonly hostname?: string;
}

export interface AdapterSelectors {
  readonly message: string;
  readonly content?: string;
}

export interface AdapterMetadataContext {
  readonly document?: Document;
  readonly href?: string;
  readonly title?: string;
}

export interface AdapterMetadata {
  readonly conversationId?: string;
  readonly sourceUrl?: string;
  readonly title?: string;
}

export interface PlatformAdapter {
  readonly capabilities: ProviderCapabilities;
  readonly id: SupportedChatPlatform;
  readonly label: string;
  readonly hostnames: readonly string[];
  readonly supportStatus: ProviderSupportStatus;
  readonly selectors: AdapterSelectors;
  readonly limitations: readonly string[];
  readonly supportWarning?: string;
  readonly providerWarnings: readonly string[];
  detect(context?: AdapterDetectionContext): boolean;
  scanVisible(root?: ParentNode): readonly ExportedMessage[];
  fullScan(root?: ParentNode): readonly ExportedMessage[];
  extractMetadata(context?: AdapterMetadataContext): AdapterMetadata;
  extractRichContent(root?: ParentNode): readonly ExportedMessage[];
  extractVisibleMessages(root?: ParentNode): readonly ExportedMessage[];
}
