export const perplexitySelectors = {
  message:
    "[data-testid='query-text'], [data-test-id='query-text'], [data-testid='query-content'], [data-testid='thread-question'], [data-testid='answer'], [data-test-id='answer'], [data-testid='answer-content'], [data-testid='thread-answer']",
  content: "article, [data-message-content], [data-testid='query-content'], [data-testid='answer-content'], .prose"
} as const;
