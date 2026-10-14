export function findHistoryScroller(root: Document, turn: Element): Element {
  for (let node = turn.parentElement; node; node = node.parentElement) {
    if (
      node.scrollHeight > node.clientHeight &&
      /^(auto|scroll|overlay)$/.test(root.defaultView?.getComputedStyle(node).overflowY ?? "")
    )
      return node;
  }
  return root.scrollingElement ?? root.documentElement;
}

export function isHistoryIndicatorVisible(element: Element, checkAria = false): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (
      node.hasAttribute("hidden") ||
      (checkAria && node.getAttribute("aria-hidden") === "true") ||
      style?.display === "none" ||
      style?.visibility === "hidden"
    )
      return false;
  }
  return true;
}
