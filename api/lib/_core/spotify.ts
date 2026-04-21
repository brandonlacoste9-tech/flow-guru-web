import { ENV } from "./env.js";
import { upsertProviderConnection, getProviderConnection } from "../db.js";

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export function buildSpotifyOAuthState(userId: number): string {
  return btoa(JSON.stringify({ userId, provider: "spotify", ts: Date.now() }));
}

export function parseSpotifyOAuthState(state: string): { userId: number } {
  try {
    const parsed = JSON.parse(atob(state));
    return { userId: Number(parsed.userId) };
  } catch {
    throw new Error("Invalid Spotify OAuth state.");
  }
}

export function getSpotifyCallbackUrl(req: { headers: { host?: string }; protocol: string }): string {
  const host = req.headers.host || "flow-guru-web.vercel.app";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}/api/integrations/spotify/callback`;
}

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
  
  // Get user profile to get a label
  const meResponse = await fetch(`${SPOTIFY_API_BASE}/me`, {
    headers: { "Authorization": `Bearer ${tokenData.access_token}` }
  });
  const meData = await meResponse.json();

  const connection = {
    userId: params.userId,
    provider: "spotify" as const,
    status: "connected" as const,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || null,
    expiresAtUnixMs: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
    externalAccountLabel: meData.display_name || meData.id || "Spotify Account",
    lastError: null,
  };

  await upsertProviderConnection(connection);
  return connection;
}

export async function refreshSpotifyToken(userId: number) {
  const connection = await getProviderConnection(userId, "spotify");
  if (!connection || !connection.refreshToken) {
    throw new Error("No Spotify refresh token available.");
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
      refresh_token: connection.refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Spotify token.");
  }

  const tokenData = await response.json();
  const updated = {
    ...connection,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || connection.refreshToken,
    expiresAtUnixMs: Date.now() + tokenData.expires_in * 1000,
  };

  await upsertProviderConnection(updated);
  return tokenData.access_token;
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

  let token = connection.accessToken;
  if (connection.expiresAtUnixMs && Date.now() > Number(connection.expiresAtUnixMs)) {
    token = await refreshSpotifyToken(params.userId);
  }

  // 1. Search for the item
  const searchUrl = `${SPOTIFY_API_BASE}/search?q=${encodeURIComponent(params.query)}&type=${params.type}&limit=1`;
  const searchResp = await fetch(searchUrl, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const searchData = await searchResp.json();
  
  const item = searchData[`${params.type}s`]?.items?.[0];
  if (!item) {
    throw new Error(`No ${params.type} found for "${params.query}"`);
  }

  // 2. Play the item (Note: requires an active device)
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
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(playBody)
  });

  if (!playResp.ok && playResp.status !== 204) {
    const err = await playResp.text();
    // 404 might mean no active device
    if (playResp.status === 404) {
      return { 
        status: "no_device", 
        message: "I found the music, but I couldn't find an active Spotify device to play it on. Open Spotify on your phone or computer first!",
        item
      };
    }
    throw new Error(`Spotify play failed: ${err}`);
  }

  return { status: "success", item };
}
