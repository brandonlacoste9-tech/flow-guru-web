import crypto from "node:crypto";
import { ENV } from "./env.js";
import { upsertProviderConnection, getProviderConnection } from "../db.js";
import { encryptToken, decryptToken } from "./crypto.js";

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

/* ── HMAC-signed OAuth state (same pattern as Google Calendar) ─────────── */

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string) {
  return crypto
    .createHmac("sha256", ENV.cookieSecret || "flow-guru-provider-state")
    .update(payload)
    .digest("base64url");
}

type SpotifyOAuthState = {
  provider: "spotify";
  userId: number;
  issuedAt: number;
};

export function buildSpotifyOAuthState(userId: number): string {
  const payload = JSON.stringify({
    provider: "spotify",
    userId,
    issuedAt: Date.now(),
  } satisfies SpotifyOAuthState);
  return `${base64UrlEncode(payload)}.${signPayload(payload)}`;
}

export function parseSpotifyOAuthState(state: string): { userId: number } {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Spotify OAuth state is malformed.");
  }

  const payload = base64UrlDecode(encodedPayload);
  const expectedSignature = signPayload(payload);
  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  ) {
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
    throw new Error("Spotify OAuth state expired (15 min window).");
  }

  return { userId: parsed.userId };
}

/* ── Callback URL helper ─────────────────────────────────────────────── */

export function getSpotifyCallbackUrl(req: { headers: { host?: string }; protocol: string }): string {
  const host = req.headers.host || "flow-guru-web.vercel.app";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}/api/integrations/spotify/callback`;
}

/* ── Token exchange (no profile lookup – userId comes from signed state) ── */

export async function connectSpotify(params: {
  userId: number;
  code: string;
  redirectUri: string;
}) {
  const authHeader = btoa(`${ENV.spotifyClientId}:${ENV.spotifyClientSecret}`);
  
  const response = await fetch(SPOTIFY_AUTH_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Spotify token exchange failed: ${err}`);
  }

  const tokenData = await response.json();
  
  // Best-effort profile fetch for a friendly label (non-fatal if it fails)
  let accountLabel = "Spotify Account";
  try {
    const meResponse = await fetch(`${SPOTIFY_API_BASE}/me`, {
      headers: { "Authorization": `Bearer ${tokenData.access_token}` }
    });
    if (meResponse.ok) {
      const meData = await meResponse.json();
      accountLabel = meData.display_name || meData.id || accountLabel;
    }
  } catch {
    // Profile fetch is cosmetic — swallow errors
  }

  const connection = {
    userId: params.userId,
    provider: "spotify" as const,
    status: "connected" as const,
    accessToken: encryptToken(tokenData.access_token),
    refreshToken: encryptToken(tokenData.refresh_token || null),
    expiresAtUnixMs: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
    externalAccountLabel: accountLabel,
    lastError: null,
  };

  await upsertProviderConnection(connection);
  return connection;
}

export async function refreshSpotifyToken(userId: number) {
  const connection = await getProviderConnection(userId, "spotify");
  if (!connection || !connection.refreshToken) {
    throw new Error("Spotify connection lost. Please reconnect in settings.");
  }

  const storedRefreshToken = decryptToken(connection.refreshToken);
  if (!storedRefreshToken) {
    throw new Error("Spotify session expired. Please reconnect in settings.");
  }

  const authHeader = btoa(`${ENV.spotifyClientId}:${ENV.spotifyClientSecret}`);
  const response = await fetch(SPOTIFY_AUTH_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: storedRefreshToken,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[Spotify] Refresh failed:", errText);
    throw new Error("Spotify session could not be refreshed. Try reconnecting.");
  }

  const tokenData = await response.json();
  const updated = {
    ...connection,
    accessToken: encryptToken(tokenData.access_token),
    refreshToken: encryptToken(tokenData.refresh_token || storedRefreshToken),
    expiresAtUnixMs: Date.now() + (tokenData.expires_in || 3600) * 1000,
  };

  await upsertProviderConnection(updated);
  return tokenData.access_token as string;
}

export async function searchAndPlaySpotify(params: {
  userId: number;
  query: string;
  type: string;
}) {
  const connection = await getProviderConnection(params.userId, "spotify");
  if (!connection || connection.status !== "connected") {
    throw new Error("Spotify not connected.");
  }

  let token = decryptToken(connection.accessToken);
  if (!token || (connection.expiresAtUnixMs && Date.now() > Number(connection.expiresAtUnixMs) - 60000)) {
    token = await refreshSpotifyToken(params.userId);
  }

  const executeSearchAndPlay = async (accessToken: string) => {
    // 1. Search
    const searchUrl = `${SPOTIFY_API_BASE}/search?q=${encodeURIComponent(params.query)}&type=${params.type}&limit=1`;
    const searchResp = await fetch(searchUrl, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    
    if (searchResp.status === 401) return { retry: true };
    if (!searchResp.ok) throw new Error(`Spotify search failed (${searchResp.status})`);

    const searchData = await searchResp.json();
    const item = searchData[`${params.type}s`]?.items?.[0];
    if (!item) {
      throw new Error(`No ${params.type} found for "${params.query}"`);
    }

    // 2. Play
    const playUrl = `${SPOTIFY_API_BASE}/me/player/play`;
    const playBody: any = {};
    if (params.type === "track") {
      playBody.uris = [item.uri];
    } else {
      playBody.context_uri = item.uri;
    }

    const playResp = await fetch(playUrl, {
      method: "PUT",
      headers: { 
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(playBody)
    });

    if (playResp.status === 401) return { retry: true };
    
    if (!playResp.ok && playResp.status !== 204) {
      const err = await playResp.text();
      if (playResp.status === 404) {
        return { 
          status: "no_device" as const, 
          message: "Spotify found the music, but I couldn't find an active device. Open Spotify on your phone or computer first!",
          item
        };
      }
      throw new Error(`Spotify playback failed (${playResp.status}): ${err}`);
    }

    return { status: "success" as const, item };
  };

  let result = await executeSearchAndPlay(token!);
  
  if ((result as any).retry) {
    token = await refreshSpotifyToken(params.userId);
    result = await executeSearchAndPlay(token);
  }

  return result as { status: "success" | "no_device"; message?: string; item: any };
}
