export const chatGptSelectors = {
  messageByRole: "[data-message-author-role]",
  conversationTurn: "[data-testid^='conversation-turn-']",
  codeBlocks: "pre code, pre",
  markdownBody: ".markdown, [data-message-author-role]"
} as const;

export const CHATGPT_EXPLICIT_FINAL_ANSWER_SELECTORS = [
  "[data-jelluvi-final-answer]",
  "[data-testid='final-answer']",
  "[data-testid*='final-answer' i]",
  "[data-testid*='final-response' i]",
  "[data-testid*='assistant-response' i]"
].join(",");

export const CHATGPT_FINAL_ANSWER_SELECTORS = [
  CHATGPT_EXPLICIT_FINAL_ANSWER_SELECTORS,
  "[data-message-author-role='assistant'] .markdown",
  ".markdown.prose",
  ".markdown"
].join(",");
