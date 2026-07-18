export const claudeSelectors = {
  message:
    "[data-testid='user-message'], [data-testid='assistant-message'], [role='article'] [data-is-streaming], [data-local-export-platform='claude'][data-local-export-role]",
  content: ".standard-markdown, .font-claude-message, [data-message-content], .prose"
} as const;
