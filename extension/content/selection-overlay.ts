import { cleanText } from "../../src/utils/text";
import { chatGptSelectors } from "../../src/adapters/chatgpt/selectors";
import { getMessageFingerprint, type MessageSelection } from "../../src/core/selection";
import type { ChatRole } from "../../src/core/schema";
import { normalizeRole } from "../../src/core/normalize";

const CONTROL_ATTRIBUTE = "data-local-export-selection-control";
const MESSAGE_ATTRIBUTE = "data-local-export-selection-message";

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

  return {
    cleanup() {
      for (const control of controls.splice(0)) {
        control.node.remove();
      }

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

      messageElements.forEach((messageElement, index) => {
        const role = normalizeRole(messageElement.getAttribute("data-message-author-role"));
        const text = cleanText(messageElement.textContent ?? "");
        const id = getStableElementId(messageElement, role, text, index);
        const checkbox = rootDocument.createElement("input");
        const label = rootDocument.createElement("label");

        checkbox.type = "checkbox";
        checkbox.setAttribute("aria-label", `Select message ${index + 1}`);
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
    }
  };
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
