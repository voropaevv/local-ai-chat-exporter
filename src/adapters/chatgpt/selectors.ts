export const chatGptSelectors = {
  messageByRole: "[data-message-author-role]",
  conversationTurn: "[data-testid^='conversation-turn-']",
  codeBlocks: "pre code, pre",
  markdownBody: ".markdown, [data-message-author-role]"
} as const;
