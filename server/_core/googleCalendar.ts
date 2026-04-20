import crypto from "node:crypto";
import { ENV } from "./env";
import { getProviderConnection, upsertProviderConnection } from "../db";

type GoogleOAuthState = {
  provider: "google-calendar";
  userId: number;
  issuedAt: number;
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleCalendarListResponse = {
  items?: Array<{
    id?: string;
    summary?: string;
    description?: string;
    htmlLink?: string;
    status?: string;
    start?: { dateTime?: string; date?: string; timeZone?: string };
    end?: { dateTime?: string; date?: string; timeZone?: string };
    location?: string;
    attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string }>;
  }>;
};

type GoogleCalendarInsertResponse = {
  id?: string;
  summary?: string;
  htmlLink?: string;
  status?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
};

const GOOGLE_CALENDAR_READ_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GOOGLE_CALENDAR_WRITE_SCOPE = "https://www.googleapis.com/auth/calendar.events";

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string) {
  return crypto.createHmac("sha256", ENV.cookieSecret || "flow-guru-provider-state")
    .update(payload)
    .digest("base64url");
}

type CallbackRequestLike = {
  protocol?: string;
  get?: (name: string) => string | undefined;
  headers?: {
    host?: string | string[] | undefined;
    "x-forwarded-host"?: string | string[] | undefined;
    "x-forwarded-proto"?: string | string[] | undefined;
  };
};

function getHeaderValue(
  req: CallbackRequestLike,
  name: "host" | "x-forwarded-host" | "x-forwarded-proto",
) {
  const direct = typeof req.get === "function" ? req.get(name) : undefined;
  if (direct) {
    return direct.split(",")[0]?.trim() || undefined;
  }

  const raw = req.headers?.[name];
  if (typeof raw === "string") {
    return raw.split(",")[0]?.trim() || undefined;
  }
  if (Array.isArray(raw)) {
    return raw[0]?.split(",")[0]?.trim() || undefined;
  }

  return undefined;
}

export function getGoogleCalendarCallbackUrl(req: CallbackRequestLike) {
  const host = getHeaderValue(req, "x-forwarded-host") || getHeaderValue(req, "host") || "localhost:3000";
  const forwardedProtocol = getHeaderValue(req, "x-forwarded-proto");
  const fallbackProtocol = req.protocol?.replace(/:$/, "") || "https";
  const protocol = forwardedProtocol?.replace(/:$/, "") || fallbackProtocol;
  const normalizedProtocol = protocol === "http" && host.includes("manus.computer") ? "https" : protocol;
  return `${normalizedProtocol}://${host}/api/integrations/google-calendar/callback`;
}

export function buildGoogleOAuthState(userId: number) {
  const payload = JSON.stringify({
    provider: "google-calendar",
    userId,
    issuedAt: Date.now(),
  } satisfies GoogleOAuthState);
  return `${base64UrlEncode(payload)}.${signPayload(payload)}`;
}

export function parseGoogleOAuthState(state: string) {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Google OAuth state is malformed.");
  }

  const payload = base64UrlDecode(encodedPayload);
  const expectedSignature = signPayload(payload);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error("Google OAuth state signature did not match.");
  }

  const parsed = JSON.parse(payload) as GoogleOAuthState;
  if (parsed.provider !== "google-calendar") {
    throw new Error("Google OAuth state provider was invalid.");
  }
  if (!parsed.userId || !parsed.issuedAt) {
    throw new Error("Google OAuth state was incomplete.");
  }
  if (Date.now() - parsed.issuedAt > 1000 * 60 * 15) {
    throw new Error("Google OAuth state expired.");
  }

  return parsed;
}

async function exchangeGoogleCode(params: {
  code: string;
  redirectUri: string;
}) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const payload = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `Google token exchange failed with ${response.status}.`);
  }

  return payload;
}

async function refreshGoogleToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const payload = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `Google token refresh failed with ${response.status}.`);
  }

  return payload;
}

async function fetchGoogleProfile(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Google profile request failed with ${response.status}.`);
  }

  return (await response.json()) as {
    id?: string;
    email?: string;
    name?: string;
  };
}

export async function connectGoogleCalendar(params: {
  userId: number;
  code: string;
  redirectUri: string;
}) {
  const token = await exchangeGoogleCode({
    code: params.code,
    redirectUri: params.redirectUri,
  });
  const profile = await fetchGoogleProfile(token.access_token!);

  await upsertProviderConnection({
    userId: params.userId,
    provider: "google-calendar",
    status: "connected",
    externalAccountId: profile.id ?? profile.email ?? "google-calendar",
    externalAccountLabel: profile.email ?? profile.name ?? "Google Calendar",
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    scope: token.scope ?? null,
    tokenType: token.token_type ?? "Bearer",
    expiresAtUnixMs: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
    lastError: null,
  });

  return {
    accountLabel: profile.email ?? profile.name ?? "Google Calendar",
  };
}

function hasGoogleScope(scopeValue: string | null | undefined, requiredScope: string) {
  return (scopeValue ?? "")
    .split(/\s+/)
    .map(scope => scope.trim())
    .includes(requiredScope);
}

function assertGoogleCalendarScope(scopeValue: string | null | undefined, requiredScope: string, actionLabel: string) {
  if (!hasGoogleScope(scopeValue, requiredScope)) {
    throw new Error(`Google Calendar needs to be reconnected with the required permissions before I can ${actionLabel}.`);
  }
}

export async function getGoogleCalendarAccessToken(userId: number) {
  const connection = (await getProviderConnection(userId, "google-calendar")) as any;
  if (!connection || connection.status !== "connected" || !connection.accessToken) {
    throw new Error("Google Calendar is not connected for this user.");
  }

  const expiresAt = connection.expiresAtUnixMs ?? 0;
  if (expiresAt > Date.now() + 60_000) {
    return connection.accessToken;
  }

  if (!connection.refreshToken) {
    throw new Error("Google Calendar needs to be reconnected because the refresh token is missing.");
  }

  const refreshed = await refreshGoogleToken(connection.refreshToken);
  await upsertProviderConnection({
    userId,
    provider: "google-calendar",
    status: "connected",
    externalAccountId: connection.externalAccountId ?? null,
    externalAccountLabel: connection.externalAccountLabel ?? null,
    accessToken: refreshed.access_token,
    refreshToken: connection.refreshToken,
    scope: refreshed.scope ?? connection.scope ?? null,
    tokenType: refreshed.token_type ?? connection.tokenType ?? "Bearer",
    expiresAtUnixMs: refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : null,
    lastError: null,
  });

  return refreshed.access_token!;
}

async function googleCalendarRequest<T>(accessToken: string, url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Calendar request failed with ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

export async function listGoogleCalendarEvents(params: {
  userId: number;
  timeMinIso?: string;
  timeMaxIso?: string;
  maxResults?: number;
  query?: string | null;
}) {
  const connection = await getProviderConnection(params.userId, "google-calendar");
  assertGoogleCalendarScope(connection?.scope, GOOGLE_CALENDAR_READ_SCOPE, "read your Google Calendar");
  const accessToken = await getGoogleCalendarAccessToken(params.userId);
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", params.timeMinIso ?? new Date().toISOString());
  if (params.timeMaxIso) {
    url.searchParams.set("timeMax", params.timeMaxIso);
  }
  url.searchParams.set("maxResults", String(params.maxResults ?? 5));
  if (params.query) {
    url.searchParams.set("q", params.query);
  }

  return googleCalendarRequest<GoogleCalendarListResponse>(accessToken, url.toString());
}

export async function createGoogleCalendarEvent(params: {
  userId: number;
  title: string;
  startIso: string;
  endIso: string;
  timeZone?: string | null;
  description?: string | null;
}) {
  const connection = await getProviderConnection(params.userId, "google-calendar");
  assertGoogleCalendarScope(connection?.scope, GOOGLE_CALENDAR_WRITE_SCOPE, "add events to your Google Calendar");
  const accessToken = await getGoogleCalendarAccessToken(params.userId);

  return googleCalendarRequest<GoogleCalendarInsertResponse>(
    accessToken,
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      body: JSON.stringify({
        summary: params.title,
        description: params.description ?? undefined,
        start: {
          dateTime: params.startIso,
          timeZone: params.timeZone ?? undefined,
        },
        end: {
          dateTime: params.endIso,
          timeZone: params.timeZone ?? undefined,
        },
      }),
    },
  );
}
