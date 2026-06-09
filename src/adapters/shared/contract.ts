import type {
  AdapterMetadata,
  AdapterMetadataContext,
  PlatformAdapter
} from "../types";

type VisibleExtractor = PlatformAdapter["extractVisibleMessages"];

export function createVisibleAdapterContract(extractVisibleMessages: VisibleExtractor): Pick<
  PlatformAdapter,
  "extractMetadata" | "extractRichContent" | "extractVisibleMessages" | "fullScan" | "scanVisible"
> {
  return {
    extractMetadata: extractDefaultMetadata,
    extractRichContent: extractVisibleMessages,
    extractVisibleMessages,
    fullScan: extractVisibleMessages,
    scanVisible: extractVisibleMessages
  };
}

export function createProviderWarnings(
  supportWarning: string | undefined,
  limitations: readonly string[]
): readonly string[] {
  return [...(supportWarning !== undefined ? [supportWarning] : []), ...limitations];
}

function extractDefaultMetadata(context: AdapterMetadataContext = {}): AdapterMetadata {
  const title = context.title ?? getDocumentTitle(context.document);
  const sourceUrl = context.href;
  const conversationId = sourceUrl === undefined ? undefined : getConversationId(sourceUrl);

  return {
    ...(conversationId !== undefined ? { conversationId } : {}),
    ...(sourceUrl !== undefined ? { sourceUrl } : {}),
    ...(title !== undefined ? { title } : {})
  };
}

function getDocumentTitle(rootDocument: Document | undefined): string | undefined {
  const title = rootDocument?.title.trim();

  return title !== undefined && title.length > 0 ? title : undefined;
}

function getConversationId(sourceUrl: string): string | undefined {
  try {
    const url = new URL(sourceUrl);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const conversationMarkerIndex = pathParts.indexOf("c");

    if (conversationMarkerIndex >= 0) {
      return pathParts[conversationMarkerIndex + 1];
    }
  } catch {
    return undefined;
  }

  return undefined;
}
