import crypto from "node:crypto";
import { ENV } from "./env.js";
import { getProviderConnection, upsertProviderConnection } from "../db.js";
import { encryptToken, decryptToken } from "./crypto.js";

type SpotifyOAuthState = {
  provider: "spotify";
  userId: number;
  issuedAt: number;
};

type SpotifyTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

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

export function getSpotifyCallbackUrl(req: CallbackRequestLike) {
  const host = getHeaderValue(req, "x-forwarded-host") || getHeaderValue(req, "host") || "localhost:3000";
  const forwardedProtocol = getHeaderValue(req, "x-forwarded-proto");
  const fallbackProtocol = req.protocol?.replace(/:$/, "") || "https";
  const protocol = forwardedProtocol?.replace(/:$/, "") || fallbackProtocol;
  const normalizedProtocol = protocol === "http" && host.includes("manus.computer") ? "https" : protocol;
  return `${normalizedProtocol}://${host}/api/integrations/spotify/callback`;
}

export function buildSpotifyOAuthState(userId: number) {
  const payload = JSON.stringify({
    provider: "spotify",
    userId,
    issuedAt: Date.now(),
  } satisfies SpotifyOAuthState);
  return `${base64UrlEncode(payload)}.${signPayload(payload)}`;
}

export function parseSpotifyOAuthState(state: string) {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Spotify OAuth state is malformed.");
  }

  const payload = base64UrlDecode(encodedPayload);
  const expectedSignature = signPayload(payload);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error("Spotify OAuth state signature did not match.");
  }

  const parsed = JSON.parse(payload) as SpotifyOAuthState;
  if (parsed.provider !== "spotify") {
    throw new Error("Spotify OAuth state provider was invalid.");
  }
  if (!parsed.userId || !parsed.issuedAt) {
    throw new Error("Spotify OAuth state was incomplete.");
  }
  if (Date.now() - parsed.issuedAt > 1000 * 60 * 15) {
    throw new Error("Spotify OAuth state expired.");
  }

  return parsed;
}

async function exchangeSpotifyCode(params: {
  code: string;
  redirectUri: string;
}) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${ENV.spotifyClientId}:${ENV.spotifyClientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      code: params.code,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const payload = (await response.json()) as SpotifyTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `Spotify token exchange failed with ${response.status}.`);
  }

  return payload;
}

async function refreshSpotifyToken(refreshToken: string) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${ENV.spotifyClientId}:${ENV.spotifyClientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const payload = (await response.json()) as SpotifyTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `Spotify token refresh failed with ${response.status}.`);
  }

  return payload;
}

async function fetchSpotifyProfile(accessToken: string) {
  const response = await fetch("https://api.spotify.com/v1/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Spotify profile request failed with ${response.status}.`);
  }

  return (await response.json()) as {
    id: string;
    display_name?: string;
    email?: string;
  };
}

export async function connectSpotify(params: {
  userId: number;
  code: string;
  redirectUri: string;
}) {
  const token = await exchangeSpotifyCode({
    code: params.code,
    redirectUri: params.redirectUri,
  });
  const profile = await fetchSpotifyProfile(token.access_token!);

  await upsertProviderConnection({
    userId: params.userId,
    provider: "spotify",
    status: "connected",
    externalAccountId: profile.id,
    externalAccountLabel: profile.display_name ?? profile.email ?? profile.id,
    accessToken: encryptToken(token.access_token ?? null),
    refreshToken: encryptToken(token.refresh_token ?? null),
    scope: token.scope ?? null,
    tokenType: token.token_type ?? "Bearer",
    expiresAtUnixMs: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
    lastError: null,
  });

  return {
    accountLabel: profile.display_name ?? profile.email ?? profile.id,
  };
}

export async function getSpotifyAccessToken(userId: number) {
  const connection = (await getProviderConnection(userId, "spotify")) as any;
  if (!connection || connection.status !== "connected" || !connection.accessToken) {
    throw new Error("Spotify is not connected for this user.");
  }

  const accessToken = decryptToken(connection.accessToken);
  const refreshToken = decryptToken(connection.refreshToken);

  const expiresAt = connection.expiresAtUnixMs ?? 0;
  if (expiresAt > Date.now() + 60_000) {
    return accessToken!;
  }

  if (!refreshToken) {
    throw new Error("Spotify needs to be reconnected because the refresh token is missing.");
  }

  const refreshed = await refreshSpotifyToken(refreshToken);
  await upsertProviderConnection({
    userId,
    provider: "spotify",
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

export async function playSpotifyTrack(userId: number, query: string) {
  const accessToken = await getSpotifyAccessToken(userId);
  
  // 1. Search for track/playlist
  const searchRes = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track,playlist&limit=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  if (!searchRes.ok) throw new Error("Spotify search failed");
  const searchData = await searchRes.json();
  
  const track = searchData.tracks?.items?.[0];
  const playlist = searchData.playlists?.items?.[0];
  
  const uri = track?.uri || playlist?.uri;
  if (!uri) throw new Error("No Spotify results found");

  // 2. Start playback
  const playRes = await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      context_uri: playlist?.uri,
      uris: track ? [track.uri] : undefined,
    }),
  });

  if (!playRes.ok) {
    const error = await playRes.json();
    if (error.error?.reason === "NO_ACTIVE_DEVICE") {
      throw new Error("No active Spotify device found. Open Spotify on one of your devices.");
    }
    throw new Error(error.error?.message || "Spotify playback failed");
  }

  return {
    title: track?.name || playlist?.name,
    artist: track?.artists?.[0]?.name,
    uri,
  };
}
