export const claudeSelectors = {
  message:
    "[data-testid='user-message'], [data-testid='assistant-message'], [data-local-export-platform='claude'][data-local-export-role]",
  content: ".font-claude-message, [data-message-content], .prose"
} as const;
