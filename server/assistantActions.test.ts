import { beforeEach, describe, expect, it, vi } from "vitest";

const llmMocks = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
}));

const mapMocks = vi.hoisted(() => ({
  makeRequest: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  getProviderConnection: vi.fn(),
  listUserLists: vi.fn(),
  getListItems: vi.fn(),
  addListItem: vi.fn(),
  deleteListItem: vi.fn(),
  toggleListItem: vi.fn(),
  createList: vi.fn(),
  deleteList: vi.fn(),
  updateList: vi.fn(),
  updateListItem: vi.fn(),
  setListItemReminder: vi.fn(),
  setListItemLocationTrigger: vi.fn(),
  createLocalEvent: vi.fn(),
  listUserMemoryFacts: vi.fn(),
}));

const googleCalendarMocks = vi.hoisted(() => ({
  listGoogleCalendarEvents: vi.fn(),
  createGoogleCalendarEvent: vi.fn(),
}));

const elevenLabsMocks = vi.hoisted(() => ({
  generateSoundAsDataUri: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: llmMocks.invokeLLM,
}));

vi.mock("./_core/map", () => ({
  makeRequest: mapMocks.makeRequest,
}));

vi.mock("./db", () => ({
  getProviderConnection: dbMocks.getProviderConnection,
  listUserLists: dbMocks.listUserLists,
  getListItems: dbMocks.getListItems,
  addListItem: dbMocks.addListItem,
  deleteListItem: dbMocks.deleteListItem,
  toggleListItem: dbMocks.toggleListItem,
  createList: dbMocks.createList,
  deleteList: dbMocks.deleteList,
  updateList: dbMocks.updateList,
  updateListItem: dbMocks.updateListItem,
  setListItemReminder: dbMocks.setListItemReminder,
  setListItemLocationTrigger: dbMocks.setListItemLocationTrigger,
  createLocalEvent: dbMocks.createLocalEvent,
  listUserMemoryFacts: dbMocks.listUserMemoryFacts,
}));

vi.mock("./_core/googleCalendar", () => ({
  listGoogleCalendarEvents: googleCalendarMocks.listGoogleCalendarEvents,
  createGoogleCalendarEvent: googleCalendarMocks.createGoogleCalendarEvent,
}));

vi.mock("./_core/elevenLabs", () => ({
  generateSoundAsDataUri: elevenLabsMocks.generateSoundAsDataUri,
}));

const NULL_EXTENSIONS = { reminder: null, browser: null, subagent: null, contact: null } as const;

describe.sequential("assistantActions", () => {
  beforeEach(() => {
    llmMocks.invokeLLM.mockReset();
    mapMocks.makeRequest.mockReset();
    Object.values(dbMocks).forEach(mock => mock.mockReset());
    googleCalendarMocks.listGoogleCalendarEvents.mockReset();
    googleCalendarMocks.createGoogleCalendarEvent.mockReset();
    elevenLabsMocks.generateSoundAsDataUri.mockReset();
    dbMocks.getProviderConnection.mockResolvedValue(null);
    dbMocks.listUserMemoryFacts.mockResolvedValue([]);
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
      ...NULL_EXTENSIONS,
    });

    expect(result).toEqual({
      action: "route.get",
      status: "needs_input",
      title: "Starting point needed",
      summary: `I can route to Office, but I need a starting place. Say where you're leaving from (e.g. "from home to …"), or enable location for this site and send your message again so I can use your current position. If you saved a home address in memory, say "from my place".`,
    });
    expect(mapMocks.makeRequest).not.toHaveBeenCalled();
  });

  it("executes route.get with directions and maps URLs", async () => {
    const { executeAssistantAction } = await import("./assistantActions");

    mapMocks.makeRequest.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path.includes("geocode")) {
        const addr = String(params?.address ?? "").toLowerCase();
        if (addr.includes("brooklyn")) {
          return {
            status: "OK",
            results: [
              {
                formatted_address: "Brooklyn, NY, USA",
                geometry: { location: { lat: 40.67, lng: -73.94 } },
              },
            ],
          };
        }
        if (addr.includes("manhattan")) {
          return {
            status: "OK",
            results: [
              {
                formatted_address: "Manhattan, NY, USA",
                geometry: { location: { lat: 40.75, lng: -73.98 } },
              },
            ],
          };
        }
      }
      if (path.includes("directions")) {
        const origin = String(params?.origin ?? "");
        const destination = String(params?.destination ?? "");
        return {
          status: "OK",
          routes: [
            {
              summary: "Sample Route",
              legs: [
                {
                  start_address: origin,
                  end_address: destination,
                  distance: { text: "10 mi", value: 16093 },
                  duration: { text: "25 mins", value: 1500 },
                  duration_in_traffic: { text: "30 mins", value: 1800 },
                  steps: [{ html_instructions: "Head <b>north</b>" }],
                },
              ],
            },
          ],
        };
      }
      return { status: "ZERO_RESULTS", results: [] };
    });

    const result = await executeAssistantAction(
      {
        action: "route.get",
        rationale: "Directions",
        route: { origin: "Brooklyn", destination: "Manhattan", mode: "driving" },
        weather: null,
        news: null,
        calendar: null,
        music: null,
        list: null,
        knowledge: null,
        ...NULL_EXTENSIONS,
      },
      { userId: 1, message: "", memoryContext: "" },
    );

    expect(result.status).toBe("executed");
    expect(String(result.data?.mapsUrlGoogle ?? "")).toContain("google.com/maps/dir/");
    expect(String(result.data?.mapsUrlApple ?? "")).toContain("maps.apple.com");
  });

  it("fills route origin from home_address in memory when omitted", async () => {
    const { executeAssistantAction } = await import("./assistantActions");

    mapMocks.makeRequest.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path.includes("geocode")) {
        const addr = String(params?.address ?? "").toLowerCase();
        if (addr.includes("main st") || addr.includes("toronto")) {
          return {
            status: "OK",
            results: [
              {
                formatted_address: "123 Main St, Toronto, ON, Canada",
                geometry: { location: { lat: 43.65, lng: -79.38 } },
              },
            ],
          };
        }
        if (addr.includes("cn tower")) {
          return {
            status: "OK",
            results: [
              {
                formatted_address: "CN Tower, Toronto, ON, Canada",
                geometry: { location: { lat: 43.64, lng: -79.39 } },
              },
            ],
          };
        }
      }
      if (path.includes("directions")) {
        const origin = String(params?.origin ?? "");
        const destination = String(params?.destination ?? "");
        return {
          status: "OK",
          routes: [
            {
              summary: "King St",
              legs: [
                {
                  start_address: origin,
                  end_address: destination,
                  distance: { text: "2 km", value: 2000 },
                  duration: { text: "8 mins", value: 480 },
                  steps: [{ html_instructions: "Go west" }],
                },
              ],
            },
          ],
        };
      }
      return { status: "ZERO_RESULTS", results: [] };
    });

    const result = await executeAssistantAction(
      {
        action: "route.get",
        rationale: "Directions",
        route: { origin: null, destination: "CN Tower Toronto", mode: "driving" },
        weather: null,
        news: null,
        calendar: null,
        music: null,
        list: null,
        knowledge: null,
        ...NULL_EXTENSIONS,
      },
      {
        userId: 1,
        message: "",
        memoryContext:
          "Known memory facts:\n- [preference] home_address: 123 Main St, Toronto, ON, Canada",
      },
    );

    expect(result.status).toBe("executed");
    expect(mapMocks.makeRequest).toHaveBeenCalled();
  });

  it("contact.open returns tel and sms links when contact_phone fact exists", async () => {
    const { executeAssistantAction } = await import("./assistantActions");
    dbMocks.listUserMemoryFacts.mockResolvedValueOnce([
      { factKey: "contact_phone_wife", factValue: "+1 (555) 555-0199", category: "preference" },
    ]);

    const result = await executeAssistantAction(
      {
        action: "contact.open",
        rationale: "Call spouse",
        route: null,
        weather: null,
        news: null,
        calendar: null,
        music: null,
        list: null,
        knowledge: null,
        ...NULL_EXTENSIONS,
        contact: { channel: "call", targetName: "wife" },
      },
      { userId: 1, message: "call my wife", memoryContext: "", language: "en" },
    );

    expect(result.status).toBe("executed");
    expect(result.data?.hrefCall).toBe("tel:+15555550199");
    expect(result.data?.hrefSms).toBe("sms:+15555550199");
  });

  it("contact.open dials inline digits without a saved contact_phone fact", async () => {
    const { executeAssistantAction } = await import("./assistantActions");
    dbMocks.listUserMemoryFacts.mockResolvedValueOnce([]);

    const result = await executeAssistantAction(
      {
        action: "contact.open",
        rationale: "Call number",
        route: null,
        weather: null,
        news: null,
        calendar: null,
        music: null,
        list: null,
        knowledge: null,
        ...NULL_EXTENSIONS,
        contact: { channel: "call", targetName: "514 777 5427" },
      },
      { userId: 1, message: "call 514 777 5427", memoryContext: "", language: "en" },
    );

    expect(result.status).toBe("executed");
    expect(result.data?.hrefCall).toBe("tel:+15147775427");
    expect(result.data?.hrefSms).toBe("sms:+15147775427");
    expect(result.data?.phoneDisplay).toBe("514 777 5427");
  });

  it("planAssistantAction uses deterministic contact intent without calling the planner LLM", async () => {
    llmMocks.invokeLLM.mockRejectedValue(new Error("planner should not be called"));
    const { planAssistantAction } = await import("./assistantActions");
    const plan = await planAssistantAction({
      userName: "Sam",
      memoryContext: "",
      message: "call my wife",
      language: "en",
    });
    expect(plan.action).toBe("contact.open");
    expect(plan.contact?.targetName).toBe("wife");
  });

  describe("parseSimpleListIntent", () => {
    it("parses add milk to grocery list", async () => {
      const { parseSimpleListIntent } = await import("./assistantActions");
      const plan = parseSimpleListIntent("add milk to grocery list");
      expect(plan?.action).toBe("list.manage");
      expect(plan?.list?.action).toBe("add");
      expect(plan?.list?.listName).toBe("Grocery");
      expect(plan?.list?.itemContent).toBe("milk");
    });

    it("normalizes groceries to Grocery list name", async () => {
      const { parseSimpleListIntent } = await import("./assistantActions");
      const plan = parseSimpleListIntent("add eggs to my groceries");
      expect(plan?.list?.listName).toBe("Grocery");
      expect(plan?.list?.itemContent).toBe("eggs");
    });
  });

  describe("sanitizePhoneForHref", () => {
    it("strips spaces and parentheses", async () => {
      const { sanitizePhoneForHref } = await import("./assistantActions");
      expect(sanitizePhoneForHref("+1 (555) 222-3333")).toBe("+15552223333");
    });
  });

  describe("dialStringForTelSms", () => {
    it("prefixes 10-digit NANP with +1", async () => {
      const { dialStringForTelSms } = await import("./assistantActions");
      expect(dialStringForTelSms("5147775427")).toBe("+15147775427");
    });
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
      ...NULL_EXTENSIONS,
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
        ...NULL_EXTENSIONS,
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
      ...NULL_EXTENSIONS,
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
        ...NULL_EXTENSIONS,
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
        ...NULL_EXTENSIONS,
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
    });
    expect(result?.summary).toContain("Tuesday, April 21, 2026 at 9:30 AM");
  });

  it("saves a local calendar event when Google Calendar is not connected", async () => {
    const { executeAssistantAction } = await import("./assistantActions");
    dbMocks.createLocalEvent.mockResolvedValueOnce(77);

    const result = await executeAssistantAction(
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
        ...NULL_EXTENSIONS,
      },
      {
        userId: 7,
        userName: "Chris",
        message: "Book lunch with Steve tomorrow at noon.",
      },
    );

    expect(result).toMatchObject({
      action: "calendar.create_event",
      status: "executed",
      title: "Booked: Lunch with Steve",
      data: { id: 77, title: "Lunch with Steve" },
    });
  });

  it("plans a simple calendar add without calling the LLM planner", async () => {
    const { planAssistantAction } = await import("./assistantActions");

    const plan = await planAssistantAction({
      userName: "Brandon",
      memoryContext: "",
      message: "add dentist appointment to my calendar tomorrow at 9am",
    });

    expect(llmMocks.invokeLLM).not.toHaveBeenCalled();
    expect(plan).toMatchObject({
      action: "calendar.create_event",
      calendar: {
        title: "dentist appointment",
        startDescription: expect.stringContaining("tomorrow"),
      },
    });
  });

  it("falls back to deterministic calendar resolution when the LLM fails", async () => {
    const { executeAssistantAction } = await import("./assistantActions");
    dbMocks.getProviderConnection.mockResolvedValue({ provider: "google-calendar", status: "connected" });
    llmMocks.invokeLLM.mockResolvedValueOnce(undefined);
    googleCalendarMocks.createGoogleCalendarEvent.mockImplementationOnce(async input => ({
      id: "evt_det",
      summary: input.title,
      start: { dateTime: input.startIso, timeZone: input.timeZone },
      end: { dateTime: input.endIso, timeZone: input.timeZone },
      htmlLink: "https://calendar.google.com/event?eid=evt_det",
      status: "confirmed",
    }));

    const result = await executeAssistantAction(
      {
        action: "calendar.create_event",
        rationale: "The user wants to create an event.",
        route: null,
        weather: null,
        news: null,
        calendar: {
          title: "Dentist appointment",
          startDescription: "tomorrow at 9am",
          endDescription: null,
        },
        music: null,
        ...NULL_EXTENSIONS,
      },
      {
        userId: 42,
        userName: "Brandon",
        message: "add dentist appointment to my calendar tomorrow at 9am",
        timeZone: "America/New_York",
      },
    );

    expect(googleCalendarMocks.createGoogleCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        title: "Dentist appointment",
        timeZone: "America/New_York",
      }),
    );
    expect(result).toMatchObject({
      action: "calendar.create_event",
      status: "executed",
      provider: "google-calendar",
    });
  });

  it.skip("plays music via ElevenLabs sound generation", async () => {
    const { executeAssistantAction } = await import("./assistantActions");

    elevenLabsMocks.generateSoundAsDataUri.mockResolvedValueOnce("data:audio/mpeg;base64,abc123");

    const result = await executeAssistantAction({
      action: "music.play",
      rationale: "The user wants to play music.",
      route: null,
      weather: null,
      news: null,
      calendar: null,
      music: {
        query: "lofi study beats",
        targetType: "playlist",
      },
      ...NULL_EXTENSIONS,
    });

    expect(result).toMatchObject({
      action: "music.play",
      status: "executed",
      provider: "elevenlabs",
      title: "Playing: lofi study beats",
    });
    expect(result?.data).toMatchObject({
      audioDataUri: "data:audio/mpeg;base64,abc123",
      query: "lofi study beats",
    });
    expect(elevenLabsMocks.generateSoundAsDataUri).toHaveBeenCalledWith(
      expect.objectContaining({
        durationSeconds: 15,
        promptInfluence: 0.7,
      }),
    );
  });

  it.skip("returns a failed result when ElevenLabs sound generation errors", async () => {
    const { executeAssistantAction } = await import("./assistantActions");

    elevenLabsMocks.generateSoundAsDataUri.mockRejectedValueOnce(new Error("API quota exceeded"));

    const result = await executeAssistantAction({
      action: "music.play",
      rationale: "The user wants some music.",
      route: null,
      weather: null,
      news: null,
      calendar: null,
      music: {
        query: "chill vibes",
        targetType: null,
      },
      ...NULL_EXTENSIONS,
    });

    expect(result).toMatchObject({
      action: "music.play",
      status: "failed",
      provider: "elevenlabs",
      title: "Audio snag",
    });
  });

  it.skip("returns needs_input for browser.use without a task description", async () => {
    const { executeAssistantAction } = await import("./assistantActions");

    const result = await executeAssistantAction({
      action: "browser.use",
      rationale: "The user wants to browse the web.",
      route: null,
      weather: null,
      news: null,
      calendar: null,
      music: null,
      reminder: null,
      browser: { task_description: null },
      subagent: null,
    });

    expect(result).toMatchObject({
      action: "browser.use",
      status: "needs_input",
      title: "Browser task details needed",
    });
  });

  it.skip("returns executed result when browser microservice succeeds", async () => {
    const { executeAssistantAction } = await import("./assistantActions");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: "The current Bitcoin price is $65,000." }),
    } as Response);

    const result = await executeAssistantAction({
      action: "browser.use",
      rationale: "The user wants to find the Bitcoin price.",
      route: null,
      weather: null,
      news: null,
      calendar: null,
      music: null,
      reminder: null,
      browser: { task_description: "Find the current Bitcoin price" },
      subagent: null,
    });

    expect(result).toMatchObject({
      action: "browser.use",
      status: "executed",
      title: "Web Browsing Complete",
      summary: "The current Bitcoin price is $65,000.",
      provider: "browser-use",
    });
  });

  it.skip("returns failed result when browser microservice is unavailable", async () => {
    const { executeAssistantAction } = await import("./assistantActions");

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await executeAssistantAction({
      action: "browser.use",
      rationale: "The user wants to search the web.",
      route: null,
      weather: null,
      news: null,
      calendar: null,
      music: null,
      reminder: null,
      browser: { task_description: "Search for latest tech news" },
      subagent: null,
    });

    expect(result).toMatchObject({
      action: "browser.use",
      status: "failed",
      title: "Web Browsing Failed",
      provider: "browser-use",
    });
  });

  it.skip("returns needs_input for system.subagent without a task", async () => {
    const { executeAssistantAction } = await import("./assistantActions");

    const result = await executeAssistantAction({
      action: "system.subagent",
      rationale: "The user wants an autonomous task done.",
      route: null,
      weather: null,
      news: null,
      calendar: null,
      music: null,
      reminder: null,
      browser: null,
      subagent: { task: null },
    });

    expect(result).toMatchObject({
      action: "system.subagent",
      status: "needs_input",
      title: "Subagent task needed",
    });
  });

  it.skip("returns executed result when nullclaw subagent responds successfully", async () => {
    const { executeAssistantAction } = await import("./assistantActions");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          message: {
            parts: [{ kind: "text", text: "Done — I created the folder structure." }],
          },
        },
      }),
    } as Response);

    const result = await executeAssistantAction({
      action: "system.subagent",
      rationale: "The user wants a file system task done.",
      route: null,
      weather: null,
      news: null,
      calendar: null,
      music: null,
      reminder: null,
      browser: null,
      subagent: { task: "Create an Audit folder with subfolders for Q1 through Q4" },
    });

    expect(result).toMatchObject({
      action: "system.subagent",
      status: "executed",
      title: "Subagent Task Complete",
      summary: "Done — I created the folder structure.",
      provider: "nullclaw",
    });
  });

  it.skip("returns failed result when nullclaw subagent is unreachable", async () => {
    const { executeAssistantAction } = await import("./assistantActions");

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Connection refused"));

    const result = await executeAssistantAction({
      action: "system.subagent",
      rationale: "The user wants a system-level task done.",
      route: null,
      weather: null,
      news: null,
      calendar: null,
      music: null,
      reminder: null,
      browser: null,
      subagent: { task: "Write a Python script to process CSVs" },
    });

    expect(result).toMatchObject({
      action: "system.subagent",
      status: "failed",
      title: "Subagent error",
      provider: "nullclaw",
    });
  });

  it.skip("routes reminder.set through calendar creation when calendar is connected", async () => {
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
              title: "Reminder: Take meds",
              startIso: "2026-04-23T09:00:00-04:00",
              endIso: "2026-04-23T09:15:00-04:00",
              timeMinIso: null,
              timeMaxIso: null,
              searchQuery: null,
            }),
          },
        },
      ],
    });
    googleCalendarMocks.createGoogleCalendarEvent.mockResolvedValueOnce({
      id: "reminder-1",
      summary: "Reminder: Take meds",
      htmlLink: "https://calendar.google.com/event?eid=r1",
      status: "confirmed",
      start: { dateTime: "2026-04-23T09:00:00-04:00", timeZone: "America/New_York" },
      end: { dateTime: "2026-04-23T09:15:00-04:00", timeZone: "America/New_York" },
    });

    const result = await executeAssistantAction(
      {
        action: "reminder.set",
        rationale: "The user wants a reminder.",
        route: null,
        weather: null,
        news: null,
        calendar: null,
        music: null,
        reminder: {
          label: "Take meds",
          when: "9 AM",
          recurring: false,
        },
        browser: null,
        subagent: null,
      },
      {
        userId: 5,
        userName: "Sam",
        message: "Remind me to take my meds at 9 AM",
        timeZone: "America/New_York",
      },
    );

    expect(result).toMatchObject({
      action: "reminder.set",
      status: "executed",
      title: "Reminder set: Take meds",
      provider: "google-calendar",
    });
  });

  describe("list.manage safety", () => {
    const listPlan = (list: Record<string, unknown>) => ({
      action: "list.manage" as const,
      rationale: "The user wants to manage a list.",
      route: null,
      weather: null,
      news: null,
      calendar: null,
      music: null,
      list,
      ...NULL_EXTENSIONS,
    });

    const opts = { userId: 1, timeZone: "America/Toronto" };

    it("adds a one-word grocery item from plain chat text without calling the LLM planner", async () => {
      const { planAssistantAction, executeAssistantAction } = await import("./assistantActions");
      dbMocks.listUserLists.mockResolvedValue([{ id: 1, name: "Grocery" }]);
      dbMocks.addListItem.mockResolvedValue(200);
      dbMocks.getListItems.mockResolvedValue([{ id: 200, content: "milk", completed: 0 }]);

      const plan = await planAssistantAction({
        userName: "Brandon",
        memoryContext: "",
        message: "add milk to grocery list",
      });
      const result = await executeAssistantAction(plan, opts);

      expect(llmMocks.invokeLLM).not.toHaveBeenCalled();
      expect(dbMocks.addListItem).toHaveBeenCalledWith(1, 1, "milk");
      expect(result).toMatchObject({
        action: "list.manage",
        status: "executed",
        data: { content: "milk", listName: "Grocery" },
      });
    });

    it("adds a one-word todo item from shorthand phrasing", async () => {
      const { planAssistantAction, executeAssistantAction } = await import("./assistantActions");
      dbMocks.listUserLists.mockResolvedValue([]);
      dbMocks.createList.mockResolvedValue(12);
      dbMocks.addListItem.mockResolvedValue(201);
      dbMocks.getListItems.mockResolvedValue([{ id: 201, content: "laundry", completed: 0 }]);

      const plan = await planAssistantAction({
        userName: "Brandon",
        memoryContext: "",
        message: "todo laundry",
      });
      const result = await executeAssistantAction(plan, opts);

      expect(llmMocks.invokeLLM).not.toHaveBeenCalled();
      expect(dbMocks.createList).toHaveBeenCalledWith(1, "Todo");
      expect(dbMocks.addListItem).toHaveBeenCalledWith(1, 12, "laundry");
      expect(result).toMatchObject({
        action: "list.manage",
        status: "executed",
        data: { content: "laundry", listName: "Todo" },
      });
    });

    it.skip("returns the underlying list write error instead of the generic fallback", async () => {
      const { buildActionFallbackReply, executeAssistantAction } = await import("./assistantActions");
      dbMocks.listUserLists.mockResolvedValue([{ id: 1, name: "Grocery" }]);
      dbMocks.addListItem.mockRejectedValue(new Error("column fg_lists.icon does not exist"));

      const result = await executeAssistantAction(
        listPlan({ action: "add", listName: "Grocery", itemContent: "apples" }),
        opts,
      );

      expect(result).toMatchObject({
        action: "list.manage",
        status: "failed",
        title: "List update failed",
      });
      expect(result?.summary).toContain("column fg_lists.icon does not exist");
      expect(buildActionFallbackReply(result)).toContain("List update failed");
      expect(buildActionFallbackReply(result)).toContain("column fg_lists.icon does not exist");
    });

    it("prefers an exact list-name match over a substring match", async () => {
      const { executeAssistantAction } = await import("./assistantActions");
      dbMocks.listUserLists.mockResolvedValue([
        { id: 10, name: "grocery weekly" },
        { id: 11, name: "grocery" },
      ]);
      dbMocks.getListItems.mockResolvedValue([]);

      const result = await executeAssistantAction(
        listPlan({ action: "list", listName: "grocery" }),
        opts,
      );

      expect(dbMocks.getListItems).toHaveBeenCalledWith(1, 11);
      expect(result).toMatchObject({
        action: "list.manage",
        status: "executed",
        data: { listName: "grocery" },
      });
    });

    it("removing milk does not match almond milk first", async () => {
      const { executeAssistantAction } = await import("./assistantActions");
      dbMocks.listUserLists.mockResolvedValue([{ id: 1, name: "grocery" }]);
      dbMocks.getListItems
        .mockResolvedValueOnce([
          { id: 101, content: "almond milk", completed: 0 },
          { id: 100, content: "milk", completed: 0 },
        ])
        .mockResolvedValueOnce([]);
      dbMocks.deleteListItem.mockResolvedValue(undefined);

      await executeAssistantAction(
        listPlan({ action: "remove", listName: "grocery", itemContent: "milk" }),
        opts,
      );

      expect(dbMocks.deleteListItem).toHaveBeenCalledWith(1, 100);
    });

    it("blank itemContent does not match the first row", async () => {
      const { executeAssistantAction } = await import("./assistantActions");
      dbMocks.listUserLists.mockResolvedValue([{ id: 1, name: "grocery" }]);
      dbMocks.getListItems.mockResolvedValue([
        { id: 100, content: "milk", completed: 0 },
      ]);

      const result = await executeAssistantAction(
        listPlan({ action: "remove", listName: "grocery", itemContent: "   " }),
        opts,
      );

      expect(result?.status).not.toBe("executed");
      expect(dbMocks.deleteListItem).not.toHaveBeenCalled();
    });

    it("blank listName returns needs_input", async () => {
      const { executeAssistantAction } = await import("./assistantActions");

      const result = await executeAssistantAction(
        listPlan({ action: "add", listName: "  ", itemContent: "milk" }),
        opts,
      );

      expect(result).toMatchObject({
        action: "list.manage",
        status: "needs_input",
      });
      expect(dbMocks.createList).not.toHaveBeenCalled();
      expect(dbMocks.addListItem).not.toHaveBeenCalled();
    });

    it("skips already-completed rows when matching", async () => {
      const { executeAssistantAction } = await import("./assistantActions");
      dbMocks.listUserLists.mockResolvedValue([{ id: 1, name: "grocery" }]);
      dbMocks.getListItems
        .mockResolvedValueOnce([
          { id: 99, content: "milk", completed: 1 },
          { id: 100, content: "milk", completed: 0 },
        ])
        .mockResolvedValueOnce([]);
      dbMocks.deleteListItem.mockResolvedValue(undefined);

      await executeAssistantAction(
        listPlan({ action: "remove", listName: "grocery", itemContent: "milk" }),
        opts,
      );

      expect(dbMocks.deleteListItem).toHaveBeenCalledWith(1, 100);
    });
  });
});
