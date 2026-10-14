// @vitest-environment jsdom

import { render } from "preact";
import { afterEach, describe, expect, test } from "vitest";

import { PageStatusCard } from "../../../src/ui/components/PageStatusCard";

const container = document.createElement("div");

afterEach(() => {
  render(null, container);
});

describe("PageStatusCard", () => {
  test("keeps the provider name visible inside the supported status pill", () => {
    render(
      <PageStatusCard
        activeTabStatus="ready"
        onRetry={() => undefined}
        platformLabel="ChatGPT"
        scanStatus="idle"
        sourceSupported={true}
        sourceUrl="https://chatgpt.com/c/example"
      />,
      container
    );

    expect(container.querySelector(".page-status-card__copy strong")?.textContent).toBe(
      "chatgpt.com"
    );
    expect(container.querySelector(".ready-pill")?.textContent).toContain("ChatGPT");
  });

  test("keeps the unsupported label visible inside the error status pill", () => {
    render(
      <PageStatusCard
        activeTabStatus="ready"
        onRetry={() => undefined}
        scanStatus="idle"
        sourceSupported={false}
        sourceUrl="chrome://extensions/"
      />,
      container
    );

    expect(container.querySelector(".page-status-card__copy strong")?.textContent).toBe(
      "extensions"
    );
    expect(container.querySelector(".ready-pill")?.textContent).toContain("Unsupported");
  });
});
