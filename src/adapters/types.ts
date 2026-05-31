import type { ChatPlatform, ExportedMessage } from "../core/schema";

export interface AdapterDetectionContext {
  readonly document?: ParentNode;
  readonly hostname?: string;
}

export interface PlatformAdapter {
  readonly id: ChatPlatform;
  readonly label: string;
  detect(context?: AdapterDetectionContext): boolean;
  extractVisibleMessages(root?: ParentNode): readonly ExportedMessage[];
}
