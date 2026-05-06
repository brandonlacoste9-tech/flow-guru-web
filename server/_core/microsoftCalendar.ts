import crypto from "node:crypto";
import { ENV } from "./env";
import { getProviderConnection, upsertProviderConnection } from "../db";
import { encryptToken, decryptToken } from "./crypto";

type MicrosoftOAuthState = {
  provider: "microsoft-calendar";
  userId: number;
  issuedAt: number;
};

type MicrosoftTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type MicrosoftCalendarListResponse = {
  value?: Array<{
    id?: string;
    subject?: string;
    bodyPreview?: string;
    webLink?: string;
    start?: { dateTime?: string; timeZone?: string };
    end?: { dateTime?: string; timeZone?: string };
    location?: { displayName?: string };
    attendees?: Array<{ emailAddress?: { address?: string; name?: string }; status?: { response?: string } }>;
  }>;
};

const MS_CALENDAR_READ_SCOPE = "Calendars.Read";
const MS_CALENDAR_WRITE_SCOPE = "Calendars.ReadWrite";

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

export function getMicrosoftCalendarCallbackUrl(req: CallbackRequestLike) {
  const host = getHeaderValue(req, "x-forwarded-host") || getHeaderValue(req, "host") || "localhost:3000";
  const forwardedProtocol = getHeaderValue(req, "x-forwarded-proto");
  const fallbackProtocol = req.protocol?.replace(/:$/, "") || "https";
  const protocol = forwardedProtocol?.replace(/:$/, "") || fallbackProtocol;
  const normalizedProtocol = protocol === "http" && host.includes("manus.computer") ? "https" : protocol;
  return `${normalizedProtocol}://${host}/api/integrations/microsoft-calendar/callback`;
}

export function buildMicrosoftOAuthState(userId: number) {
  const payload = JSON.stringify({
    provider: "microsoft-calendar",
    userId,
    issuedAt: Date.now(),
  } satisfies MicrosoftOAuthState);
  return `${base64UrlEncode(payload)}.${signPayload(payload)}`;
}

export function parseMicrosoftOAuthState(state: string) {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Microsoft OAuth state is malformed.");
  }

  const payload = base64UrlDecode(encodedPayload);
  const expectedSignature = signPayload(payload);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error("Microsoft OAuth state signature did not match.");
  }

  const parsed = JSON.parse(payload) as MicrosoftOAuthState;
  if (parsed.provider !== "microsoft-calendar") {
    throw new Error("Microsoft OAuth state provider was invalid.");
  }
  if (!parsed.userId || !parsed.issuedAt) {
    throw new Error("Microsoft OAuth state was incomplete.");
  }
  if (Date.now() - parsed.issuedAt > 1000 * 60 * 15) {
    throw new Error("Microsoft OAuth state expired.");
  }

  return parsed;
}

async function exchangeMicrosoftCode(params: {
  code: string;
  redirectUri: string;
}) {
  const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: ENV.microsoftClientId,
      client_secret: ENV.microsoftClientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const payload = (await response.json()) as MicrosoftTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `Microsoft token exchange failed with ${response.status}.`);
  }

  return payload;
}

async function refreshMicrosoftToken(refreshToken: string) {
  const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: ENV.microsoftClientId,
      client_secret: ENV.microsoftClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const payload = (await response.json()) as MicrosoftTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `Microsoft token refresh failed with ${response.status}.`);
  }

  return payload;
}

async function fetchMicrosoftProfile(accessToken: string) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Microsoft profile request failed with ${response.status}.`);
  }

  return (await response.json()) as {
    id?: string;
    mail?: string;
    userPrincipalName?: string;
    displayName?: string;
  };
}

export async function connectMicrosoftCalendar(params: {
  userId: number;
  code: string;
  redirectUri: string;
}) {
  const token = await exchangeMicrosoftCode({
    code: params.code,
    redirectUri: params.redirectUri,
  });
  const profile = await fetchMicrosoftProfile(token.access_token!);

  await upsertProviderConnection({
    userId: params.userId,
    provider: "microsoft-calendar",
    status: "connected",
    externalAccountId: profile.id ?? profile.mail ?? profile.userPrincipalName ?? "microsoft-calendar",
    externalAccountLabel: profile.mail ?? profile.userPrincipalName ?? profile.displayName ?? "Outlook Calendar",
    accessToken: encryptToken(token.access_token ?? null),
    refreshToken: encryptToken(token.refresh_token ?? null),
    scope: token.scope ?? null,
    tokenType: token.token_type ?? "Bearer",
    expiresAtUnixMs: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
    lastError: null,
  });

  return {
    accountLabel: profile.mail ?? profile.userPrincipalName ?? profile.displayName ?? "Outlook Calendar",
  };
}

export async function getMicrosoftCalendarAccessToken(userId: number) {
  const connection = (await getProviderConnection(userId, "microsoft-calendar")) as any;
  if (!connection || connection.status !== "connected" || !connection.accessToken) {
    throw new Error("Outlook Calendar is not connected for this user.");
  }

  const accessToken = decryptToken(connection.accessToken);
  const refreshToken = decryptToken(connection.refreshToken);

  const expiresAt = connection.expiresAtUnixMs ?? 0;
  if (expiresAt > Date.now() + 60_000) {
    return accessToken!;
  }

  if (!refreshToken) {
    throw new Error("Outlook Calendar needs to be reconnected because the refresh token is missing.");
  }

  const refreshed = await refreshMicrosoftToken(refreshToken);
  await upsertProviderConnection({
    userId,
    provider: "microsoft-calendar",
    status: "connected",
    externalAccountId: connection.externalAccountId ?? null,
    externalAccountLabel: connection.externalAccountLabel ?? null,
    accessToken: encryptToken(refreshed.access_token ?? null),
    refreshToken: encryptToken(refreshed.refresh_token ?? refreshToken),
    scope: refreshed.scope ?? connection.scope ?? null,
    tokenType: refreshed.token_type ?? connection.tokenType ?? "Bearer",
    expiresAtUnixMs: refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : null,
    lastError: null,
  });

  return refreshed.access_token!;
}

async function microsoftGraphRequest<T>(accessToken: string, url: string, init?: RequestInit) {
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
    throw new Error(`Microsoft Graph request failed with ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

export async function listMicrosoftCalendarEvents(params: {
  userId: number;
  timeMinIso?: string;
  timeMaxIso?: string;
  maxResults?: number;
  query?: string | null;
}) {
  const accessToken = await getMicrosoftCalendarAccessToken(params.userId);
  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarview");
  
  const start = params.timeMinIso ?? new Date().toISOString();
  const end = params.timeMaxIso ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  
  url.searchParams.set("startDateTime", start);
  url.searchParams.set("endDateTime", end);
  url.searchParams.set("$top", String(params.maxResults ?? 10));
  url.searchParams.set("$orderby", "start/dateTime");
  
  if (params.query) {
    url.searchParams.set("$filter", `contains(subject, '${params.query.replace(/'/g, "''")}')`);
  }

  return microsoftGraphRequest<MicrosoftCalendarListResponse>(accessToken, url.toString());
}

export async function createMicrosoftCalendarEvent(params: {
  userId: number;
  title: string;
  startIso: string;
  endIso: string;
  timeZone?: string | null;
  description?: string | null;
}) {
  const accessToken = await getMicrosoftCalendarAccessToken(params.userId);

  return microsoftGraphRequest<any>(
    accessToken,
    "https://graph.microsoft.com/v1.0/me/events",
    {
      method: "POST",
      body: JSON.stringify({
        subject: params.title,
        body: {
          contentType: "text",
          content: params.description ?? "",
        },
        start: {
          dateTime: params.startIso,
          timeZone: params.timeZone ?? "UTC",
        },
        end: {
          dateTime: params.endIso,
          timeZone: params.timeZone ?? "UTC",
        },
      }),
    },
  );
}
