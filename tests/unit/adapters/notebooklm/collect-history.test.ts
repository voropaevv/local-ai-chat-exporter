import { JSDOM } from "jsdom";
import { expect, test } from "vitest";
import { collectNotebookHistory } from "../../../../src/adapters/notebooklm/collect-history";
import { scanCurrentConversationExport } from "../../../../src/content/scan";

test("export entrypoint traverses Notebook history before packaging", async () => {
  const { document } = fixture();
  let polls = 0;
  const result = await scanCurrentConversationExport({
    document,
    hostname: "notebook.google.com",
    href: "https://notebook.google.com/notebook/test",
    waitForDomSettle: async () => {
      polls++;
    }
  });
  expect(polls).toBeGreaterThan(20);
  expect(result.completeness.reachedTop).toBe(true);
});

function fixture() {
  const document = new JSDOM('<chat-panel><div class="chat-panel-content"></div></chat-panel>', {
    url: "https://notebook.google.com/notebook/test"
  }).window.document;
  const panel = document.querySelector<HTMLElement>(".chat-panel-content")!;
  let top = 400;
  Object.defineProperties(panel, {
    clientHeight: { value: 100 },
    scrollHeight: { value: 500 },
    scrollTop: {
      get: () => top,
      set: (value) => {
        top = Math.min(400, value);
      }
    }
  });
  const pair = () =>
    '<div class="chat-message-pair"><div class="from-user-message-inner-content"><div class="message-text-content">Repeat</div></div><div class="to-user-message-inner-content"><div class="message-text-content">OK</div></div></div>';
  panel.innerHTML = pair();
  return { document, panel, pair };
}

test("loads predecessors, preserves identical turns and restores viewport", async () => {
  const { document, panel, pair } = fixture();
  let polls = 0;
  const result = await collectNotebookHistory({
    document,
    wait: async () => {
      if (++polls === 12) panel.insertAdjacentHTML("afterbegin", pair());
    }
  });
  expect(result).toMatchObject({ reachedTop: true, reachedBottom: true });
  expect(result?.messages.map((m) => m.text)).toEqual(["Repeat", "OK", "Repeat", "OK"]);
  expect(panel.scrollTop).toBe(400);
  expect(new Set(result?.messages.map((m) => m.id)).size).toBe(4);
});

test("recycled nodes cannot confirm completeness without stable identifiers", async () => {
  const { document, panel, pair } = fixture();
  let polls = 0;
  const result = await collectNotebookHistory({
    document,
    wait: async () => {
      if (++polls === 5) panel.innerHTML = pair();
    }
  });
  expect(result?.reachedBottom).toBe(false);
});

test("busy state and exhausted budget fail closed", async () => {
  const { document, panel } = fixture();
  panel.setAttribute("aria-busy", "true");
  const result = await collectNotebookHistory({ document, maxSteps: 50, wait: async () => {} });
  expect(result).toMatchObject({ reachedTop: false, reachedBottom: false });
});

test("reused nodes with changed text cannot confirm completeness", async () => {
  const { document, panel } = fixture();
  let polls = 0;
  const result = await collectNotebookHistory({
    document,
    wait: async () => {
      if (++polls === 5) panel.querySelector(".message-text-content")!.textContent = "Other turn";
    }
  });
  expect(result?.reachedTop).toBe(false);
  expect(result?.reachedBottom).toBe(false);
});

test("cancellation restores viewport and navigation invalidates source", async () => {
  const { document, panel } = fixture();
  const controller = new AbortController();
  await expect(
    collectNotebookHistory({
      document,
      signal: controller.signal,
      wait: async () => controller.abort()
    })
  ).rejects.toThrow("cancelled");
  expect(panel.scrollTop).toBe(400);
  await expect(
    collectNotebookHistory({
      document,
      wait: async () => {
        document.defaultView!.history.pushState({}, "", "/notebook/other");
      }
    })
  ).rejects.toThrow("source conversation changed");
});
