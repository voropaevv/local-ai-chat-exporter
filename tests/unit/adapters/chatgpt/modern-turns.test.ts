import { JSDOM } from "jsdom";
import { expect, test } from "vitest";
import { collectModernChatGptTurns } from "../../../../src/adapters/chatgpt/modern-turns";

function fixture() {
  const document = new JSDOM('<main style="overflow-y:auto"></main>', {
    url: "https://chatgpt.com/c/test"
  }).window.document;
  const main = document.querySelector("main")!;
  Object.defineProperties(main, { clientHeight: { value: 100 }, scrollHeight: { value: 300 } });
  const render = (ids: number[], collapsed = false) => {
    main.innerHTML = ids
      .map(
        (
          id
        ) => `<div data-turn-key="${id}"><div data-content-search-turn-key="${id}"><div class="group"><div>
    <div><h4>You said:</h4><p>Repeat_01_OK</p>${collapsed ? "<button>Show more</button>" : ""}</div>
    <div><div data-content-search-unit-key="a${id}"><h4 data-conversation-role="assistant">ChatGPT said:</h4><p>Answer_01_OK</p><button>Copy</button></div></div>
    </div></div></div></div>`
      )
      .join("");
  };
  render([3]);
  main.scrollTop = 200;
  return { document, main, render };
}

test("keyed pairs wait for delayed top hydration then traverse forward preserving repeats", async () => {
  const { document, main, render } = fixture();
  let polls = 0;
  const result = await collectModernChatGptTurns({
    document,
    maxSteps: 90,
    wait: async () => {
      if (++polls > 4) render(main.scrollTop < 80 ? [1] : main.scrollTop < 160 ? [2] : [3]);
    }
  });
  expect(result?.messages.map((m) => m.id)).toEqual(
    [1, 2, 3].flatMap((id) => [`chatgpt-${id}-user`, `chatgpt-${id}-assistant`])
  );
  expect(result?.messages.map((m) => m.text)).toEqual(
    [1, 2, 3].flatMap(() => ["Repeat_01_OK", "Answer_01_OK"])
  );
  expect(result?.reachedTop).toBe(true);
  expect(result?.reachedBottom).toBe(true);
  expect(main.scrollTop).toBe(200);
});

test("collapsed messages must expand before capture", async () => {
  const { document, render } = fixture();
  render([1], true);
  let clicks = 0;
  document.querySelector("button")!.onclick = () => {
    clicks++;
    render([1]);
  };
  const result = await collectModernChatGptTurns({ document, maxSteps: 60, wait: async () => {} });
  expect(clicks).toBe(1);
  expect(result?.messages).toHaveLength(2);
});

test("disabled expansion never yields a complete result", async () => {
  const { document, render } = fixture();
  render([1], true);
  document.querySelector("button")!.disabled = true;
  const result = await collectModernChatGptTurns({ document, maxSteps: 3, wait: async () => {} });
  expect(result?.reachedTop).toBe(false);
  expect(result?.messages).toHaveLength(0);
});

test("visible loading blocks a premature top verdict; hidden loading does not", async () => {
  const { document, main, render } = fixture();
  let polls = 0;
  const result = await collectModernChatGptTurns({
    document,
    maxSteps: 110,
    wait: async () => {
      polls++;
      if (polls <= 30) {
        render([3]);
        main.insertAdjacentHTML("afterbegin", "<span>Loading older messages…</span>");
      } else {
        render(main.scrollTop < 80 ? [1] : main.scrollTop < 160 ? [2] : [3]);
        main.insertAdjacentHTML(
          "afterbegin",
          "<div hidden><span>Loading older messages…</span></div>"
        );
      }
    }
  });
  expect(result?.reachedTop).toBe(true);
  expect(result?.messages).toHaveLength(6);
  expect(result?.messages[0].id).toBe("chatgpt-1-user");
});

test("duplicate turn keys and source navigation fail closed", async () => {
  const { document, render } = fixture();
  render([1, 1]);
  const result = await collectModernChatGptTurns({ document, maxSteps: 60, wait: async () => {} });
  expect(result?.reachedTop).toBe(false);
  await expect(
    collectModernChatGptTurns({
      document,
      wait: async () => {
        document.defaultView!.history.pushState({}, "", "/c/another");
      }
    })
  ).rejects.toThrow("changed");
});

test("cancellation restores viewport and unrelated layouts retain existing fallback", async () => {
  const { document, main } = fixture();
  const controller = new AbortController();
  await expect(
    collectModernChatGptTurns({
      document,
      signal: controller.signal,
      wait: async () => controller.abort()
    })
  ).rejects.toThrow("cancelled");
  expect(main.scrollTop).toBe(200);
  main.innerHTML = "<h4>You said:</h4><p>not a keyed turn</p>";
  expect(await collectModernChatGptTurns({ document })).toBeNull();
});
