export const LOGTHREAD_GITHUB_URL = "https://github.com/voropaevv/local-ai-chat-exporter";
export const LOGTHREAD_PRIVACY_URL = `${LOGTHREAD_GITHUB_URL}/blob/main/PRIVACY.md`;
export const LOGTHREAD_SPONSORS_URL = [
  "https:",
  "",
  "github.com",
  "sponsors",
  "voropaevv"
].join("/");
export const LOGTHREAD_OPENCOLLECTIVE_URL = [
  "https:",
  "",
  "opencollective.com",
  "logthread"
].join("/");

export const SUPPORT_TAGLINE = "Core exports stay free and open-source.";

export const SUPPORT_LINKS = [
  { href: LOGTHREAD_SPONSORS_URL, label: "GitHub Sponsors" },
  { href: LOGTHREAD_OPENCOLLECTIVE_URL, label: "OpenCollective" }
] as const;
