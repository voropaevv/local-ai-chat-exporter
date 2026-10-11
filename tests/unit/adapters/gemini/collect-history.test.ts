import { JSDOM } from "jsdom";
import { expect, test } from "vitest";
import { collectGeminiHistory } from "../../../../src/adapters/gemini/collect-history";

function fixture() {
  const document = new JSDOM('<main style="overflow-y:auto"></main>', {
    url: "https://gemini.google.com/app/test"
  }).window.document;
  const main = document.querySelector("main")!;
  let top = 400;
  Object.defineProperties(main, {
    clientHeight: { value: 100 },
    scrollHeight: { value: 500 },
    scrollTop: {
      get: () => top,
      set: (value) => {
        top = Math.min(400, value);
      }
    }
  });
  const render = (ids: number[]) => {
    main.innerHTML = ids
      .map(
        (id) =>
          `<div class="conversation-container" id="turn-${id}"><user-query><div class="query-text">Repeat</div></user-query><model-response><message-content>OK</message-content></model-response></div>`
      )
      .join("");
  };
  render([3]);
  return { document, main, render };
}

test("waits for delayed top history, traverses down once and preserves repeated turns", async () => {
  const { document, main, render } = fixture();
  let polls = 0;
  const result = await collectGeminiHistory({
    document,
    maxSteps: 90,
    wait: async () => {
      polls++;
      if (polls > 12) render(main.scrollTop < 80 ? [1] : main.scrollTop < 240 ? [2] : [3]);
    }
  });
  expect(result?.messages.map((m) => m.id)).toEqual([
    "gemini-turn-1-user",
    "gemini-turn-1-assistant",
    "gemini-turn-2-user",
    "gemini-turn-2-assistant",
    "gemini-turn-3-user",
    "gemini-turn-3-assistant"
  ]);
  expect(result).toMatchObject({ reachedTop: true, reachedBottom: true });
  expect(main.scrollTop).toBe(400);
});

test("budget exhaustion and incomplete turns never confirm both boundaries", async () => {
  const { document, main } = fixture();
  const short = await collectGeminiHistory({ document, maxSteps: 3, wait: async () => {} });
  expect(short?.reachedTop).toBe(false);
  main.querySelector("model-response")!.remove();
  const incomplete = await collectGeminiHistory({ document, maxSteps: 90, wait: async () => {} });
  expect(incomplete?.reachedBottom).toBe(false);
});

test("cancellation restores viewport; unknown layout returns null", async () => {
  const { document, main } = fixture();
  const abort = new AbortController();
  await expect(
    collectGeminiHistory({
      document,
      signal: abort.signal,
      wait: async () => {
        abort.abort();
      }
    })
  ).rejects.toThrow("cancelled");
  expect(main.scrollTop).toBe(400);
  main.innerHTML = "";
  expect(await collectGeminiHistory({ document })).toBeNull();
});

test("busy loading and duplicate turn identifiers cannot confirm completeness", async () => {
  for (const duplicate of [false, true]) {
    const { document, main } = fixture();
    if (duplicate) main.append(main.firstElementChild!.cloneNode(true));
    else main.setAttribute("aria-busy", "true");
    const result = await collectGeminiHistory({ document, maxSteps: 90, wait: async () => {} });
    expect(result?.reachedBottom).toBe(false);
  }
});

test("navigation during a wait invalidates the source", async () => {
  const { document } = fixture();
  let changed = false;
  await expect(
    collectGeminiHistory({
      document,
      wait: async () => {
        if (!changed) {
          document.defaultView!.history.pushState({}, "", "/app/other");
          changed = true;
        }
      }
    })
  ).rejects.toThrow("source conversation changed");
});

test("unrelated sidebar and hidden history spinners do not block stable boundaries", async () => {
  const { document, main } = fixture();
  document.body.insertAdjacentHTML("beforeend", '<aside><div role="progressbar"></div></aside>');
  main.insertAdjacentHTML(
    "beforeend",
    '<div style="display:none"><div role="progressbar"></div></div>'
  );
  const result = await collectGeminiHistory({ document, maxSteps: 90, wait: async () => {} });
  expect(result).toMatchObject({ reachedTop: true, reachedBottom: true });
});
