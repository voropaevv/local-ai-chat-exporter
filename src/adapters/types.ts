import type { ChatPlatform, ExportedMessage } from "../core/schema";

export type SupportedChatPlatform = Exclude<ChatPlatform, "unknown">;

export interface AdapterDetectionContext {
  readonly document?: ParentNode;
  readonly hostname?: string;
}

export interface AdapterSelectors {
  readonly message: string;
  readonly content?: string;
}

export interface PlatformAdapter {
  readonly id: SupportedChatPlatform;
  readonly label: string;
  readonly hostnames: readonly string[];
  readonly selectors: AdapterSelectors;
  readonly limitations: readonly string[];
  readonly experimentalWarning?: string;
  detect(context?: AdapterDetectionContext): boolean;
  extractVisibleMessages(root?: ParentNode): readonly ExportedMessage[];
}
