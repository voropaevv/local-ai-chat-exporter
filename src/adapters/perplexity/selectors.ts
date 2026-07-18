export const perplexitySelectors = {
  message:
    "[data-testid='query-text'], [data-test-id='query-text'], [data-testid='query-content'], [data-testid='thread-question'], [class~='group/query'], [data-testid='answer'], [data-test-id='answer'], [data-testid='answer-content'], [data-testid='thread-answer'], main [id^='markdown-content-'] .prose[data-renderer='lm']",
  content:
    "article, [data-message-content], [data-testid='query-content'], [data-testid='answer-content'], .prose"
} as const;
