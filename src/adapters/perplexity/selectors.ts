export const perplexityUserSelector =
  "[data-testid='query-text'], [data-test-id='query-text'], [data-testid='query-content'], [data-testid='thread-question'], [class~='group/query'], [class~='group/user-bubble']";
export const perplexityAnswerSelector =
  "[data-testid='answer'], [data-test-id='answer'], [data-testid='answer-content'], [data-testid='thread-answer'], [class~='group/final-text'], main [id^='markdown-content-'] .prose[data-renderer='lm']";
export const perplexitySelectors = {
  message: `${perplexityUserSelector}, ${perplexityAnswerSelector}`,
  content:
    "article, [data-message-content], [data-testid='query-content'], [data-testid='answer-content'], .prose"
} as const;
