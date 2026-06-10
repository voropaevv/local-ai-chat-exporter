import { cleanText } from "../../src/utils/text";
import { chatGptSelectors } from "../../src/adapters/chatgpt/selectors";
import { getMessageFingerprint, type MessageSelection } from "../../src/core/selection";
import type { ChatRole } from "../../src/core/schema";
import { normalizeRole } from "../../src/core/normalize";

const CONTROL_ATTRIBUTE = "data-local-export-selection-control";
const MESSAGE_ATTRIBUTE = "data-local-export-selection-message";
const TOOLBAR_ATTRIBUTE = "data-local-export-selection-toolbar";
const ACTION_ATTRIBUTE = "data-local-export-selection-action";

export interface SelectionOverlayController {
  cleanup(): void;
  getSelection(): MessageSelection;
  show(): void;
}

interface OverlayControl {
  readonly checkbox: HTMLInputElement;
  readonly fingerprint: string;
  readonly id: string;
  readonly node: HTMLElement;
}

export function createSelectionOverlay(
  rootDocument: Document = document
): SelectionOverlayController {
  const controls: OverlayControl[] = [];
  let toolbar: HTMLElement | undefined;
  let countNode: HTMLElement | undefined;
  let lastClickedIndex: number | undefined;

  return {
    cleanup() {
      for (const control of controls.splice(0)) {
        control.node.remove();
      }

      toolbar?.remove();
      toolbar = undefined;
      countNode = undefined;
      lastClickedIndex = undefined;

      rootDocument
        .querySelectorAll(`[${MESSAGE_ATTRIBUTE}]`)
        .forEach((element) => element.removeAttribute(MESSAGE_ATTRIBUTE));
    },
    getSelection() {
      return {
        fingerprints: controls
          .filter((control) => control.checkbox.checked)
          .map((control) => control.fingerprint),
        ids: controls.filter((control) => control.checkbox.checked).map((control) => control.id)
      };
    },
    show() {
      this.cleanup();

      const messageElements = Array.from(
        rootDocument.querySelectorAll<HTMLElement>(chatGptSelectors.messageByRole)
      );

      if (messageElements.length === 0) {
        return;
      }

      toolbar = createToolbar(rootDocument, {
        onDeselectAll: () => {
          setAllChecked(controls, false);
          updateCount(countNode, controls);
        },
        onSelectAll: () => {
          setAllChecked(controls, true);
          updateCount(countNode, controls);
        }
      });
      countNode = toolbar.querySelector<HTMLElement>("[data-local-export-selection-count]") ?? undefined;
      messageElements[0].before(toolbar);

      messageElements.forEach((messageElement, index) => {
        const role = normalizeRole(messageElement.getAttribute("data-message-author-role"));
        const text = cleanText(messageElement.textContent ?? "");
        const id = getStableElementId(messageElement, role, text, index);
        const checkbox = rootDocument.createElement("input");
        const label = rootDocument.createElement("label");

        checkbox.type = "checkbox";
        checkbox.checked = messageElement.getAttribute("data-local-export-selected") === "true";
        checkbox.setAttribute("aria-label", `Select message ${index + 1}`);
        checkbox.addEventListener("click", (event) => {
          if (event.shiftKey && lastClickedIndex !== undefined) {
            const start = Math.min(lastClickedIndex, index);
            const end = Math.max(lastClickedIndex, index);
            const targetChecked = checkbox.checked;

            for (let rangeIndex = start; rangeIndex <= end; rangeIndex += 1) {
              controls[rangeIndex].checkbox.checked = targetChecked;
            }
          }

          lastClickedIndex = index;
          updateCount(countNode, controls);
        });
        label.className = "logthread-selection-control";
        label.setAttribute(CONTROL_ATTRIBUTE, "true");
        label.textContent = "Export";
        label.prepend(checkbox);
        messageElement.setAttribute(MESSAGE_ATTRIBUTE, "true");
        messageElement.before(label);
        controls.push({
          checkbox,
          fingerprint: getMessageFingerprint({ role, text }),
          id,
          node: label
        });
      });

      updateCount(countNode, controls);
    }
  };
}

function createToolbar(
  rootDocument: Document,
  actions: {
    readonly onDeselectAll: () => void;
    readonly onSelectAll: () => void;
  }
): HTMLElement {
  const toolbar = rootDocument.createElement("div");
  const count = rootDocument.createElement("span");
  const selectAll = rootDocument.createElement("button");
  const deselectAll = rootDocument.createElement("button");

  toolbar.setAttribute(TOOLBAR_ATTRIBUTE, "true");
  toolbar.setAttribute("role", "group");
  toolbar.setAttribute("aria-label", "AI Chat Export selection tools");
  toolbar.className = "logthread-selection-toolbar";
  toolbar.style.cssText =
    "display:flex;gap:8px;align-items:center;position:sticky;top:8px;z-index:2147483647;margin:8px 0;padding:8px;border:1px solid var(--color-border,currentColor);border-radius:8px;background:var(--color-surface,Canvas);color:var(--color-text,CanvasText);font:12px system-ui,sans-serif;";

  count.setAttribute("data-local-export-selection-count", "true");
  count.setAttribute("role", "status");
  count.textContent = "0 selected";

  selectAll.type = "button";
  selectAll.textContent = "Select all";
  selectAll.setAttribute(ACTION_ATTRIBUTE, "select-all");
  selectAll.addEventListener("click", actions.onSelectAll);

  deselectAll.type = "button";
  deselectAll.textContent = "Deselect all";
  deselectAll.setAttribute(ACTION_ATTRIBUTE, "deselect-all");
  deselectAll.addEventListener("click", actions.onDeselectAll);

  for (const button of [selectAll, deselectAll]) {
    button.style.cssText =
      "min-height:28px;border:1px solid var(--color-border,currentColor);border-radius:6px;background:var(--color-surface-accent,Canvas);color:var(--color-text,CanvasText);padding:0 8px;font:12px system-ui,sans-serif;";
  }

  toolbar.append(count, selectAll, deselectAll);
  return toolbar;
}

function setAllChecked(controls: readonly OverlayControl[], checked: boolean): void {
  controls.forEach((control) => {
    control.checkbox.checked = checked;
  });
}

function updateCount(
  countNode: HTMLElement | undefined,
  controls: readonly OverlayControl[]
): void {
  if (countNode === undefined) {
    return;
  }

  const selectedCount = controls.filter((control) => control.checkbox.checked).length;
  countNode.textContent = `${selectedCount} selected`;
}

function getStableElementId(
  element: HTMLElement,
  role: ChatRole,
  text: string,
  fallbackIndex: number
): string {
  const candidates = [
    element.getAttribute("data-message-id"),
    element.getAttribute("data-message-id-testid"),
    element.id
  ];
  const explicitId = candidates.find(
    (candidate) => candidate !== null && candidate.trim().length > 0
  );

  return explicitId ?? `${role}-${fallbackIndex}-${text.slice(0, 40)}`;
}
