export type ProviderSupportStatus = "stable" | "beta" | "experimental";
export type ProviderCaptureMode = "full" | "visible";

export interface ProviderCapabilities {
  readonly batchExport: boolean;
  readonly captureMode: ProviderCaptureMode;
  readonly previewSelection: boolean;
  readonly richContent: boolean;
}

interface ProviderDefinition {
  readonly capabilities: ProviderCapabilities;
  readonly id: string;
  readonly label: string;
  readonly limitations: readonly string[];
  readonly origins: readonly string[];
  readonly supportStatus: ProviderSupportStatus;
  readonly supportWarning?: string;
}

export const PROVIDER_CATALOG = [
  {
    capabilities: {
      batchExport: true,
      captureMode: "full",
      previewSelection: true,
      richContent: true
    },
    id: "chatgpt",
    label: "ChatGPT",
    limitations: [],
    origins: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
    supportStatus: "stable",
    supportWarning: undefined
  },
  {
    capabilities: {
      batchExport: true,
      captureMode: "visible",
      previewSelection: true,
      richContent: false
    },
    id: "claude",
    label: "Claude",
    limitations: ["Visible-message extraction only; unloaded or collapsed turns may be missing."],
    origins: ["https://claude.ai/*"],
    supportStatus: "beta",
    supportWarning:
      "Claude support is beta. Verify first and last messages before relying on export."
  },
  {
    capabilities: {
      batchExport: true,
      captureMode: "visible",
      previewSelection: true,
      richContent: false
    },
    id: "gemini",
    label: "Gemini",
    limitations: ["Visible-message extraction only; unloaded or collapsed turns may be missing."],
    origins: ["https://gemini.google.com/*"],
    supportStatus: "beta",
    supportWarning:
      "Gemini support is beta. Verify first and last messages before relying on export."
  },
  {
    capabilities: {
      batchExport: true,
      captureMode: "visible",
      previewSelection: true,
      richContent: false
    },
    id: "perplexity",
    label: "Perplexity",
    limitations: ["Visible-message extraction only; unloaded or collapsed turns may be missing."],
    origins: ["https://perplexity.ai/*", "https://www.perplexity.ai/*"],
    supportStatus: "experimental",
    supportWarning:
      "Perplexity support is experimental. Verify first and last messages before relying on export."
  },
  {
    capabilities: {
      batchExport: true,
      captureMode: "visible",
      previewSelection: true,
      richContent: false
    },
    id: "notebooklm",
    label: "NotebookLM",
    limitations: ["Visible-message extraction only; unloaded or collapsed turns may be missing."],
    origins: ["https://notebooklm.google.com/*"],
    supportStatus: "experimental",
    supportWarning:
      "NotebookLM support is experimental. Verify first and last messages before relying on export."
  }
] as const satisfies readonly ProviderDefinition[];

export type ProviderCatalogEntry = (typeof PROVIDER_CATALOG)[number];
export type ProviderId = ProviderCatalogEntry["id"];

export const PROVIDER_IDS: readonly ProviderId[] = PROVIDER_CATALOG.map((provider) => provider.id);

export const SUPPORTED_CHAT_ORIGINS: readonly string[] = [
  ...new Set(PROVIDER_CATALOG.flatMap((provider) => provider.origins))
];

export function getProviderDefinition(providerId: ProviderId): ProviderCatalogEntry {
  const provider = PROVIDER_CATALOG.find((candidate) => candidate.id === providerId);

  if (provider === undefined) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  return provider;
}

export function getProviderHostnames(providerId: ProviderId): readonly string[] {
  return getProviderDefinition(providerId).origins.map(originPatternToHostname);
}

export function getProviderByHostname(hostname: string): ProviderCatalogEntry | undefined {
  const normalizedHostname = hostname.toLowerCase();

  return PROVIDER_CATALOG.find((provider) =>
    provider.origins.some(
      (origin) => originPatternToHostname(origin).toLowerCase() === normalizedHostname
    )
  );
}

export function getProviderByUrl(url: string): ProviderCatalogEntry | undefined {
  try {
    const parsedUrl = new URL(url);

    return PROVIDER_CATALOG.find((provider) =>
      provider.origins.some((origin) => urlMatchesOrigin(parsedUrl, origin))
    );
  } catch {
    return undefined;
  }
}

export function getProviderOriginForUrl(url: string): string | undefined {
  try {
    const parsedUrl = new URL(url);
    const provider = getProviderByUrl(url);

    return provider?.origins.find((origin) => urlMatchesOrigin(parsedUrl, origin));
  } catch {
    return undefined;
  }
}

export function getProviderWarnings(providerId: ProviderId): readonly string[] {
  const provider = getProviderDefinition(providerId);

  return [
    ...(provider.supportWarning !== undefined ? [provider.supportWarning] : []),
    ...provider.limitations
  ];
}

function originPatternToHostname(originPattern: string): string {
  return originPatternToUrl(originPattern).hostname;
}

function originPatternToUrl(originPattern: string): URL {
  return new URL(originPattern.replace(/\*$/u, ""));
}

function urlMatchesOrigin(url: URL, originPattern: string): boolean {
  const origin = originPatternToUrl(originPattern);

  return (
    url.protocol === origin.protocol &&
    url.hostname.toLowerCase() === origin.hostname.toLowerCase() &&
    url.port === origin.port
  );
}
