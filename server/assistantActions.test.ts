import { beforeEach, describe, expect, it, vi } from "vitest";

const llmMocks = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
}));

const mapMocks = vi.hoisted(() => ({
  makeRequest: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  getProviderConnection: vi.fn(),
}));

const googleCalendarMocks = vi.hoisted(() => ({
  listGoogleCalendarEvents: vi.fn(),
  createGoogleCalendarEvent: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: llmMocks.invokeLLM,
}));

vi.mock("./_core/map", () => ({
  makeRequest: mapMocks.makeRequest,
}));

vi.mock("./db", () => ({
  getProviderConnection: dbMocks.getProviderConnection,
}));

vi.mock("./_core/googleCalendar", () => ({
  listGoogleCalendarEvents: googleCalendarMocks.listGoogleCalendarEvents,
  createGoogleCalendarEvent: googleCalendarMocks.createGoogleCalendarEvent,
}));

describe("assistantActions", () => {
  beforeEach(() => {
    llmMocks.invokeLLM.mockReset();
    mapMocks.makeRequest.mockReset();
    dbMocks.getProviderConnection.mockReset();
    googleCalendarMocks.listGoogleCalendarEvents.mockReset();
    googleCalendarMocks.createGoogleCalendarEvent.mockReset();
    dbMocks.getProviderConnection.mockResolvedValue(null);
    vi.restoreAllMocks();
  });

  it("returns a missing-origin result for route requests without a start location", async () => {
    const { executeAssistantAction } = await import("./assistantActions");

    const result = await executeAssistantAction({
      action: "route.get",
      rationale: "The user wants traffic information.",
      route: {
        origin: null,
        destination: "Office",
        mode: "driving",
      },
      weather: null,
      news: null,
      calendar: null,
      music: null,
    });

    expect(result).toEqual({
      action: "route.get",
      status: "needs_input",
      title: "Starting point needed",
      summary: "I can check the route to Office, but I still need your starting point.",
    });
    expect(mapMocks.makeRequest).not.toHaveBeenCalled();
  });

  it("executes a weather lookup with geocoding and Open-Meteo data", async () => {
    const { executeAssistantAction } = await import("./assistantActions");
    mapMocks.makeRequest.mockResolvedValueOnce({
      status: "OK",
      results: [
        {
          formatted_address: "Brooklyn, NY, USA",
          geometry: {
            location: { lat: 40.6782, lng: -73.9442 },
          },
        },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        timezone: "America/New_York",
        current: {
          time: "2026-04-19T22:00",
          temperature_2m: 14,
          apparent_temperature: 13,
          weather_code: 1,
          wind_speed_10m: 9,
        },
        daily: {
          time: ["2026-04-19", "2026-04-20", "2026-04-21"],
          weather_code: [1, 3, 61],
          temperature_2m_max: [15, 16, 12],
          temperature_2m_min: [9, 10, 7],
          precipitation_probability_max: [5, 10, 55],
        },
      }),
    } as Response);

    const result = await executeAssistantAction({
      action: "weather.get",
      rationale: "The user wants the weather.",
      route: null,
      weather: {
        location: "Brooklyn",
        timeframe: "today",
      },
      news: null,
      calendar: null,
      music: null,
    });

    expect(result?.status).toBe("executed");
    expect(result?.provider).toBe("open-meteo");
    expect(result?.title).toContain("Brooklyn, NY, USA");
    expect(result?.data).toMatchObject({
      location: "Brooklyn, NY, USA",
      current: {
        temperatureC: 14,
        weatherLabel: "Mostly clear",
      },
      focusForecast: {
        date: "2026-04-19",
      },
    });
  });

  it("executes a personalized news lookup using the immediate no-key provider", async () => {
    const { executeAssistantAction } = await import("./assistantActions");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "story-1",
            slug: "ai-breakthrough",
            title: "A useful AI breakthrough",
            summary: "A short summary",
            sourceTitle: "Example Source",
            sourceUrl: "https://example.com/story-1",
            datePublished: "2026-04-19T20:00:00Z",
          },
        ],
      }),
    } as Response);

    const result = await executeAssistantAction(
      {
        action: "news.get",
        rationale: "The user wants headlines aligned with their interests.",
        route: null,
        weather: null,
        news: {
          issueSlug: null,
          interestLabel: "A calm morning brief",
          limit: 1,
        },
        calendar: null,
        music: null,
      },
      {
        memoryContext: "Preferences: follows AI research and climate policy closely.",
      },
    );

    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("issueSlug=science-technology"));
    expect(result).toMatchObject({
      action: "news.get",
      status: "executed",
      provider: "actually-relevant",
      title: "News brief for A calm morning brief",
    });
    expect(result?.data).toMatchObject({
      issueSlug: "science-technology",
      stories: [
        {
          id: "story-1",
          title: "A useful AI breakthrough",
        },
      ],
    });
  });

  it("returns a structured failed result when a live action provider errors", async () => {
    const { executeAssistantAction } = await import("./assistantActions");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response);

    const result = await executeAssistantAction({
      action: "news.get",
      rationale: "The user wants headlines aligned with their interests.",
      route: null,
      weather: null,
      news: {
        issueSlug: "science-technology",
        interestLabel: "AI and product design",
        limit: 1,
      },
      calendar: null,
      music: null,
    });

    expect(result).toMatchObject({
      action: "news.get",
      status: "failed",
      provider: "actually-relevant",
      title: "Action unavailable",
    });
  });

  it("lists live Google Calendar events when the user is connected", async () => {
    const { executeAssistantAction } = await import("./assistantActions");

    dbMocks.getProviderConnection.mockResolvedValueOnce({
      provider: "google-calendar",
      status: "connected",
      accessToken: "token",
    });
    llmMocks.invokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: null,
              startIso: null,
              endIso: null,
              timeMinIso: "2026-04-21T00:00:00-04:00",
              timeMaxIso: "2026-04-22T00:00:00-04:00",
              searchQuery: "physiotherapy",
            }),
          },
        },
      ],
    });
    googleCalendarMocks.listGoogleCalendarEvents.mockResolvedValueOnce({
      items: [
        {
          id: "event-1",
          summary: "Physiotherapy with Rick",
          start: { dateTime: "2026-04-21T09:30:00-04:00" },
          end: { dateTime: "2026-04-21T10:30:00-04:00" },
          htmlLink: "https://calendar.google.com/event?eid=1",
          status: "confirmed",
        },
      ],
    });

    const result = await executeAssistantAction(
      {
        action: "calendar.list_events",
        rationale: "The user wants to check their schedule.",
        route: null,
        weather: null,
        news: null,
        calendar: {
          title: "physiotherapy",
          startDescription: "tomorrow",
          endDescription: null,
        },
        music: null,
      },
      {
        userId: 42,
        userName: "Avery",
        message: "What do I have with Rick tomorrow morning?",
        timeZone: "America/New_York",
        memoryContext: "Recurring events: physiotherapy on weekday mornings.",
      },
    );

    expect(googleCalendarMocks.listGoogleCalendarEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        query: "physiotherapy",
      }),
    );
    expect(result).toMatchObject({
      action: "calendar.list_events",
      status: "executed",
      provider: "google-calendar",
      title: "Upcoming Google Calendar events",
    });
    expect(result?.data).toMatchObject({
      events: [
        {
          id: "event-1",
          title: "Physiotherapy with Rick",
        },
      ],
    });
  });

  it("creates a live Google Calendar booking when the user is connected", async () => {
    const { executeAssistantAction } = await import("./assistantActions");

    dbMocks.getProviderConnection.mockResolvedValueOnce({
      provider: "google-calendar",
      status: "connected",
      accessToken: "token",
    });
    llmMocks.invokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: "Physiotherapy with Rick",
              startIso: "2026-04-21T09:30:00-04:00",
              endIso: "2026-04-21T10:30:00-04:00",
              timeMinIso: null,
              timeMaxIso: null,
              searchQuery: null,
            }),
          },
        },
      ],
    });
    googleCalendarMocks.createGoogleCalendarEvent.mockResolvedValueOnce({
      id: "event-2",
      summary: "Physiotherapy with Rick",
      htmlLink: "https://calendar.google.com/event?eid=2",
      status: "confirmed",
      start: { dateTime: "2026-04-21T09:30:00-04:00", timeZone: "America/New_York" },
      end: { dateTime: "2026-04-21T10:30:00-04:00", timeZone: "America/New_York" },
    });

    const result = await executeAssistantAction(
      {
        action: "calendar.create_event",
        rationale: "The user wants to create an event.",
        route: null,
        weather: null,
        news: null,
        calendar: {
          title: "Physiotherapy with Rick",
          startDescription: "tomorrow at 9:30 AM",
          endDescription: null,
        },
        music: null,
      },
      {
        userId: 42,
        userName: "Avery",
        message: "Book physiotherapy with Rick at 9:30 tomorrow.",
        timeZone: "America/New_York",
        memoryContext: "Recurring events: physiotherapy on weekday mornings.",
      },
    );

    expect(googleCalendarMocks.createGoogleCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        title: "Physiotherapy with Rick",
        startIso: "2026-04-21T09:30:00-04:00",
        timeZone: "America/New_York",
      }),
    );
    expect(result).toMatchObject({
      action: "calendar.create_event",
      status: "executed",
      provider: "google-calendar",
      title: "Booked: Physiotherapy with Rick",
      summary: "It’s on your Google Calendar for Tuesday, April 21, 2026 at 9:30 AM.",
    });
  });

  it("returns a connection-required result for deferred calendar and music actions", async () => {
    const { executeAssistantAction } = await import("./assistantActions");

    const calendarResult = await executeAssistantAction(
      {
        action: "calendar.create_event",
        rationale: "The user wants to create an event.",
        route: null,
        weather: null,
        news: null,
        calendar: {
          title: "Lunch with Steve",
          startDescription: "tomorrow at 12",
          endDescription: null,
        },
        music: null,
      },
      {
        userId: 7,
        userName: "Chris",
        message: "Book lunch with Steve tomorrow at noon.",
      },
    );

    const musicResult = await executeAssistantAction({
      action: "music.play",
      rationale: "The user wants music playback.",
      route: null,
      weather: null,
      news: null,
      calendar: null,
      music: {
        query: "workout music",
        targetType: "playlist",
      },
    });

    expect(calendarResult).toMatchObject({
      action: "calendar.create_event",
      status: "needs_connection",
      provider: "google-calendar",
    });
    expect(musicResult).toMatchObject({
      action: "music.play",
      status: "needs_connection",
      provider: "spotify",
    });
  });
});
