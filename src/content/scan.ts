import {
  collectChatGptConversation,
  type ChatGptScrollCollectorOptions
} from "../adapters/chatgpt/scroll-collector";

export async function scanCurrentChatGptConversation(
  options: Omit<ChatGptScrollCollectorOptions, "document"> = {}
) {
  return collectChatGptConversation({
    ...options,
    document: getCurrentDocument()
  });
}

function getCurrentDocument(): Document {
  if (typeof document === "undefined") {
    throw new Error("A DOM document is required to scan the current conversation.");
  }

  return document;
}
