import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getProviderConnection: vi.fn(),
  upsertProviderConnection: vi.fn(),
}));

vi.mock("./db", () => ({
  getProviderConnection: dbMocks.getProviderConnection,
  upsertProviderConnection: dbMocks.upsertProviderConnection,
}));

describe("googleCalendar core", () => {
  const prevJwtSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret-min-16-chars";
    dbMocks.getProviderConnection.mockReset();
    dbMocks.upsertProviderConnection.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (prevJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = prevJwtSecret;
    }
    vi.useRealTimers();
  });

  it("builds an https callback URL for proxy-hosted manus preview traffic", async () => {
    const { getGoogleCalendarCallbackUrl } = await import("./_core/googleCalendar");

    expect(
      getGoogleCalendarCallbackUrl({
        protocol: "http",
        headers: {
          host: "localhost:3000",
          "x-forwarded-host": "3000-flow-guru.manus.computer",
          "x-forwarded-proto": "http",
        },
      }),
    ).toBe("https://3000-flow-guru.manus.computer/api/integrations/google-calendar/callback");
  });

  it("round-trips signed Google OAuth state for the current user", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T00:00:00Z"));

    const { buildGoogleOAuthState, parseGoogleOAuthState } = await import("./_core/googleCalendar");

    const state = buildGoogleOAuthState(42);
    expect(parseGoogleOAuthState(state)).toEqual({
      provider: "google-calendar",
      userId: 42,
      issuedAt: Date.now(),
    });
  });

  it("rejects tampered Google OAuth state", async () => {
    const { buildGoogleOAuthState, parseGoogleOAuthState } = await import("./_core/googleCalendar");

    const state = buildGoogleOAuthState(42);
    const [payload, signature] = state.split(".");
    const tampered = `${payload}.${signature?.slice(0, -1)}x`;

    expect(() => parseGoogleOAuthState(tampered)).toThrow("Google OAuth state signature did not match.");
  });

  it("persists a connected Google Calendar account after the OAuth code exchange", async () => {
    const { connectGoogleCalendar } = await import("./_core/googleCalendar");

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
          scope:
            "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
          token_type: "Bearer",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "google-user-1",
          email: "flow@example.com",
          name: "Flow Guru",
        }),
      } as Response);

    const result = await connectGoogleCalendar({
      userId: 7,
      code: "oauth-code",
      redirectUri: "https://flow-guru.example.com/api/integrations/google-calendar/callback",
    });

    expect(result).toEqual({
      accountLabel: "flow@example.com",
    });
    expect(dbMocks.upsertProviderConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        provider: "google-calendar",
        status: "connected",
        externalAccountId: "google-user-1",
        externalAccountLabel: "flow@example.com",
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresAtUnixMs: expect.any(Number),
        scope:
          "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
        tokenType: "Bearer",
        lastError: null,
      }),
    );
  });

  it("refreshes an expiring Google Calendar access token and persists the new token", async () => {
    const { encryptToken } = await import("./_core/crypto");
    const { getGoogleCalendarAccessToken } = await import("./_core/googleCalendar");

    dbMocks.getProviderConnection.mockResolvedValueOnce({
      userId: 7,
      provider: "google-calendar",
      status: "connected",
      externalAccountId: "google-user-1",
      externalAccountLabel: "flow@example.com",
      accessToken: encryptToken("stale-token"),
      refreshToken: encryptToken("refresh-token"),
      scope: "https://www.googleapis.com/auth/calendar.readonly",
      tokenType: "Bearer",
      expiresAtUnixMs: Date.now() + 30_000,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "fresh-token",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/calendar.readonly",
        token_type: "Bearer",
      }),
    } as Response);

    await expect(getGoogleCalendarAccessToken(7)).resolves.toBe("fresh-token");
    expect(dbMocks.upsertProviderConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        provider: "google-calendar",
        status: "connected",
        externalAccountId: "google-user-1",
        externalAccountLabel: "flow@example.com",
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresAtUnixMs: expect.any(Number),
        scope: "https://www.googleapis.com/auth/calendar.readonly",
        tokenType: "Bearer",
        lastError: null,
      }),
    );
  });
});
