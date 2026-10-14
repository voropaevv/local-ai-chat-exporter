import {
  getClientHeight,
  getScrollHeight,
  getScrollTop,
  isAtTop,
  setScrollTop,
  scrollToTop
} from "./scroll-container";

const TOP_HYDRATION_RETRY_MS = 2_000;

/** A quiet DOM is not proof that a lazy history request has completed. */
export async function hydrateTopBoundary(options: {
  readonly container: Element;
  readonly signal: AbortSignal;
  readonly inventory: () => { readonly signature: string; readonly suspicious: boolean };
  readonly recordProgress?: () => void;
  readonly quietMs?: number;
}): Promise<boolean> {
  const { container, signal, inventory } = options;
  const quietMs = options.quietMs ?? 10_000;
  let lastChangeAt = Date.now();
  let lastHydrationRetryAt = Date.now();
  let previousSignature: string | undefined;

  while (!signal.aborted) {
    // Prepending history can preserve the old viewport by moving scrollTop away
    // from zero. Return to the new top before considering downward traversal.
    const displaced = !isAtTop(container);
    if (displaced) scrollToTop(container);
    const current = inventory();
    const signature = `${getScrollHeight(container)}:${getClientHeight(container)}:${getScrollTop(container)}:${current.signature}`;
    if (displaced || signature !== previousSignature) {
      lastChangeAt = Date.now();
      previousSignature = signature;
      options.recordProgress?.();
    }
    if (
      isAtTop(container) &&
      current.suspicious &&
      Date.now() - lastHydrationRetryAt >= TOP_HYDRATION_RETRY_MS &&
      getScrollHeight(container) > getClientHeight(container) + 2
    ) {
      // Hidden Chromium tabs can miss the first lazy-history scroll event.
      // A one-pixel retry re-triggers the top sentinel without visible page
      // jumping or abandoning the top-first traversal order.
      setScrollTop(container, 1);
      scrollToTop(container);
      lastHydrationRetryAt = Date.now();
    }
    if (isAtTop(container) && !current.suspicious && Date.now() - lastChangeAt >= quietMs) {
      return true;
    }
    await waitForPoll(signal);
  }
  return false;
}

function waitForPoll(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, 250);
    signal.addEventListener("abort", finish, { once: true });
  });
}
