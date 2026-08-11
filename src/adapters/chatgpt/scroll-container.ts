import { getChatGptMessageCandidateCount } from "./extract-visible";

const SCROLL_EPSILON_PX = 2;
const SCROLLABLE_OVERFLOW_Y = new Set(["auto", "overlay", "scroll"]);

export function findChatGptScrollContainer(root: Document = getCurrentDocument()): Element {
  const candidates = Array.from(root.querySelectorAll("*")).filter((element) => {
    return isScrollable(element) && getChatGptMessageCandidateCount(element) > 0;
  });

  const bestCandidate = candidates.sort((left, right) => {
    const messageCountDifference =
      getChatGptMessageCandidateCount(right) - getChatGptMessageCandidateCount(left);

    if (messageCountDifference !== 0) {
      return messageCountDifference;
    }

    return getElementDepth(right) - getElementDepth(left);
  })[0];

  if (bestCandidate) {
    return bestCandidate;
  }

  return root.scrollingElement ?? root.documentElement;
}

function getElementDepth(element: Element): number {
  let depth = 0;
  let current = element.parentElement;

  while (current !== null) {
    depth += 1;
    current = current.parentElement;
  }

  return depth;
}

export function isAtTop(container: Element): boolean {
  return getScrollTop(container) <= SCROLL_EPSILON_PX;
}

export function isAtBottom(container: Element): boolean {
  return (
    getScrollTop(container) + getClientHeight(container) >=
    getScrollHeight(container) - SCROLL_EPSILON_PX
  );
}

export function getScrollTop(container: Element): number {
  return "scrollTop" in container ? Number(container.scrollTop) : 0;
}

export function getClientHeight(container: Element): number {
  return "clientHeight" in container ? Number(container.clientHeight) : 0;
}

export function getScrollHeight(container: Element): number {
  return "scrollHeight" in container ? Number(container.scrollHeight) : 0;
}

export function scrollToTop(container: Element): void {
  setScrollTop(container, 0);
}

export function setScrollTop(container: Element, scrollTop: number): void {
  container.scrollTop = scrollTop;
}

export function scrollDownBy(container: Element, pixels: number): void {
  container.scrollTop = getScrollTop(container) + pixels;
}

function isScrollable(element: Element): boolean {
  if (getScrollHeight(element) <= getClientHeight(element) + SCROLL_EPSILON_PX) {
    return false;
  }

  const ownerWindow = element.ownerDocument.defaultView;

  if (ownerWindow === null) {
    return false;
  }

  const overflowY = ownerWindow.getComputedStyle(element).overflowY.trim().toLowerCase();
  return SCROLLABLE_OVERFLOW_Y.has(overflowY);
}

function getCurrentDocument(): Document {
  if (typeof document === "undefined") {
    throw new Error("A DOM document is required to find the ChatGPT scroll container.");
  }

  return document;
}
