import { chatGptSelectors } from "./selectors";

const SCROLL_EPSILON_PX = 2;

export function findChatGptScrollContainer(root: Document = getCurrentDocument()): Element {
  const candidates = Array.from(root.querySelectorAll("*")).filter((element) => {
    return isScrollable(element) && Boolean(element.querySelector(chatGptSelectors.messageByRole));
  });

  const bestCandidate = candidates.sort((left, right) => {
    const leftMessages = left.querySelectorAll(chatGptSelectors.messageByRole).length;
    const rightMessages = right.querySelectorAll(chatGptSelectors.messageByRole).length;
    return rightMessages - leftMessages;
  })[0];

  if (bestCandidate) {
    return bestCandidate;
  }

  return root.scrollingElement ?? root.documentElement;
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
  container.scrollTop = 0;
}

export function scrollDownBy(container: Element, pixels: number): void {
  container.scrollTop = getScrollTop(container) + pixels;
}

function isScrollable(element: Element): boolean {
  return getScrollHeight(element) > getClientHeight(element) + SCROLL_EPSILON_PX;
}

function getCurrentDocument(): Document {
  if (typeof document === "undefined") {
    throw new Error("A DOM document is required to find the ChatGPT scroll container.");
  }

  return document;
}
