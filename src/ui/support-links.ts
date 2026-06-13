export const JELLUVI_GITHUB_URL = "https://github.com/voropaevv/local-ai-chat-exporter";
export const JELLUVI_PRIVACY_URL = `${JELLUVI_GITHUB_URL}/blob/main/PRIVACY.md`;
export const JELLUVI_SPONSORS_URL = [
  "https:",
  "",
  "github.com",
  "sponsors",
  "voropaevv"
].join("/");

export const SUPPORT_TAGLINE = "Jelluvi keeps exports local. No telemetry. No server uploads.";

export const SUPPORT_LINKS = [
  { href: JELLUVI_SPONSORS_URL, label: "GitHub Sponsors" }
] as const;
