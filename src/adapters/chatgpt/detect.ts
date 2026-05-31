import type { AdapterDetectionContext } from "../types";
import { chatGptSelectors } from "./selectors";

const CHATGPT_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);

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
