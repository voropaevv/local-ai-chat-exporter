import type { AdapterDetectionContext } from "../types";
import { chatGptSelectors } from "./selectors";

export const CHAT_GPT_HOSTNAMES = ["chatgpt.com", "chat.openai.com"] as const;

const CHATGPT_HOSTS = new Set<string>(CHAT_GPT_HOSTNAMES);

export function detectChatGpt(context: AdapterDetectionContext = {}): boolean {
  const hostname = context.hostname ?? getCurrentHostname();

  if (hostname && CHATGPT_HOSTS.has(hostname)) {
    return true;
  }

  return Boolean(context.document?.querySelector(chatGptSelectors.messageByRole));
}

function getCurrentHostname(): string | undefined {
  if (typeof location === "undefined") {
    return undefined;
  }

  return location.hostname;
}
