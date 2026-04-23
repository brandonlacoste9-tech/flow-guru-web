import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children: string }) => children,
}));

import { ActionResultCard, type AssistantActionResult } from "@/components/ActionResultCard";

function renderCard(result: AssistantActionResult) {
  return renderToStaticMarkup(<ActionResultCard result={result} />);
}

describe("ActionResultCard", () => {
  it("renders the route fallback when no route details are available", () => {
    const html = renderCard({
      action: "route.get",
      status: "executed",
      title: "Route checked",
      summary: "I looked for the route.",
      data: {
        origin: "Home",
        destination: "Office",
      },
    });

    expect(html).toContain("Route details for Home to Office are not available yet.");
  });

  it("renders the weather fallback when forecast details are empty", () => {
    const html = renderCard({
      action: "weather.get",
      status: "executed",
      title: "Weather checked",
      summary: "I looked up the weather.",
      data: {},
    });

    expect(html).toContain("Weather details are not available for this result yet.");
  });

  it("renders the news fallback when no stories are available", () => {
    const html = renderCard({
      action: "news.get",
      status: "executed",
      title: "News checked",
      summary: "I looked for the latest updates.",
      data: {
        stories: [],
      },
    });

    expect(html).toContain("No story cards were available for this news result yet.");
  });

  it("renders the non-executed status guidance for incomplete actions", () => {
    const html = renderCard({
      action: "calendar.create_event",
      status: "needs_input",
      title: "More detail needed",
      summary: "I still need a start time.",
    });

    expect(html).toContain("needs input");
    expect(html).toContain("without fully executing the action");
  });

  it("renders an audio player element for music.play with an audio data URI", () => {
    const html = renderCard({
      action: "music.play",
      status: "executed",
      title: "Playing: lofi study beats",
      summary: "Here is some lofi study beats for you.",
      provider: "elevenlabs",
      data: {
        audioDataUri: "data:audio/mpeg;base64,abc123",
        query: "lofi study beats",
      },
    });

    expect(html).toContain("<audio");
    expect(html).toContain("data:audio/mpeg;base64,abc123");
    expect(html).toContain("lofi study beats");
  });

  it("renders the summary text for browser.use executed results", () => {
    const html = renderCard({
      action: "browser.use",
      status: "executed",
      title: "Web Browsing Complete",
      summary: "The current Bitcoin price is $65,000.",
      provider: "browser-use",
    });

    expect(html).toContain("Web Browsing Complete");
    expect(html).toContain("The current Bitcoin price is $65,000.");
  });

  it("renders an error state with the failure message for failed actions", () => {
    const html = renderCard({
      action: "browser.use",
      status: "failed",
      title: "Web Browsing Failed",
      summary: "I tried to accomplish this via the browser agent, but it encountered an error.",
      provider: "browser-use",
    });

    expect(html).toContain("Web Browsing Failed");
    expect(html).toContain("encountered an error");
  });

  it("renders the summary for system.subagent completed results", () => {
    const html = renderCard({
      action: "system.subagent",
      status: "executed",
      title: "Subagent Task Complete",
      summary: "Done — I created the folder structure for the Audit project.",
      provider: "nullclaw",
    });

    expect(html).toContain("Subagent Task Complete");
    expect(html).toContain("Done");
  });
});
