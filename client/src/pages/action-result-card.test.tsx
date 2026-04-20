import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children: string }) => children,
}));

import { ActionResultCard, type AssistantActionResult } from "./Home";

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
      action: "calendar.create",
      status: "needs_input",
      title: "More detail needed",
      summary: "I still need a start time.",
    });

    expect(html).toContain("needs input");
    expect(html).toContain("without fully executing the action");
  });
});
