import { JSDOM } from "jsdom";
import { afterEach, expect, test, vi } from "vitest";
import { hydrateTopBoundary } from "../../../../src/adapters/chatgpt/top-boundary";

afterEach(() => vi.useRealTimers());

test("waits through repeated delayed prepends and scroll anchoring before accepting the top", async () => {
  vi.useFakeTimers();
  const container = new JSDOM("<main></main>").window.document.querySelector("main")!;
  const controller = new AbortController();
  let firstTurn = 80;
  let settled = false;
  container.scrollTop = 900;
  const result = hydrateTopBoundary({
    container,
    signal: controller.signal,
    inventory: () => ({ signature: String(firstTurn), suspicious: firstTurn !== 1 })
  }).then((value) => {
    settled = true;
    return value;
  });
  await vi.advanceTimersByTimeAsync(4_000);
  expect(settled).toBe(false);
  firstTurn = 40;
  container.scrollTop = 800;
  await vi.advanceTimersByTimeAsync(4_000);
  expect(container.scrollTop).toBe(0);
  expect(settled).toBe(false);
  firstTurn = 1;
  container.scrollTop = 400;
  await vi.advanceTimersByTimeAsync(250);
  expect(container.scrollTop).toBe(0);
  await vi.advanceTimersByTimeAsync(9_999);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test("cancels an unproven top promptly without leaking timers", async () => {
  vi.useFakeTimers();
  const container = new JSDOM("<main></main>").window.document.querySelector("main")!;
  const controller = new AbortController();
  const result = hydrateTopBoundary({
    container,
    signal: controller.signal,
    inventory: () => ({ signature: "80", suspicious: true })
  });
  await vi.advanceTimersByTimeAsync(15_000);
  controller.abort();
  expect(await result).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

test("retries the top sentinel when a hidden tab misses the first scroll event", async () => {
  vi.useFakeTimers();
  const container = new JSDOM("<main></main>").window.document.querySelector("main")!;
  const controller = new AbortController();
  const scrollWrites: number[] = [];
  let scrollTop = 0;
  Object.defineProperties(container, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 1_000 },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
        scrollWrites.push(value);
      }
    }
  });

  const result = hydrateTopBoundary({
    container,
    signal: controller.signal,
    inventory: () => ({ signature: "still-loading", suspicious: true })
  });
  await vi.advanceTimersByTimeAsync(2_250);

  expect(scrollWrites).toContain(1);
  expect(scrollWrites.at(-1)).toBe(0);
  controller.abort();
  expect(await result).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
