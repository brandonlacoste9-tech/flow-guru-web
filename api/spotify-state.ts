import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sdk } from "./lib/_core/sdk.js";
import { getProviderConnection } from "./lib/db.js";
import { decryptToken } from "./lib/_core/crypto.js";
import { refreshSpotifyToken } from "./lib/_core/spotify.js";

const SPOTIFY_API = "https://api.spotify.com/v1";

async function getValidSpotifyToken(userId: number): Promise<string | null> {
  const connection = await getProviderConnection(userId, "spotify");
  if (!connection || connection.status !== "connected" || !connection.accessToken) {
    return null;
  }

  const expiresAt = connection.expiresAtUnixMs ? Number(connection.expiresAtUnixMs) : 0;
  if (expiresAt > Date.now() + 60_000) {
    return decryptToken(connection.accessToken);
  }

  // Token expired — refresh
  try {
    return await refreshSpotifyToken(userId);
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ connected: false, nowPlaying: null, playlists: [] });
    }

    const token = await getValidSpotifyToken(user.id);
    if (!token) {
      return res.json({ connected: false, nowPlaying: null, playlists: [] });
    }

    // Fetch currently playing
    let nowPlaying: any = null;
    try {
      const cpResp = await fetch(`${SPOTIFY_API}/me/player/currently-playing`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (cpResp.status === 200) {
        const cpData = await cpResp.json();
        if (cpData.item) {
          nowPlaying = {
            trackId: cpData.item.id,
            name: cpData.item.name,
            artists: (cpData.item.artists ?? []).map((a: any) => a.name),
            albumArt: cpData.item.album?.images?.[0]?.url ?? null,
            isPlaying: cpData.is_playing ?? false,
            progressMs: cpData.progress_ms ?? 0,
            durationMs: cpData.item.duration_ms ?? 0,
          };
        }
      }
      // 204 = nothing playing, that's fine
    } catch {
      // Swallow — nowPlaying stays null
    }

    // Fetch user playlists
    let playlists: any[] = [];
    try {
      const plResp = await fetch(`${SPOTIFY_API}/me/playlists?limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (plResp.ok) {
        const plData = await plResp.json();
        playlists = (plData.items ?? []).map((p: any) => ({
          id: p.id,
          name: p.name,
          image: p.images?.[0]?.url ?? null,
          trackCount: p.tracks?.total ?? 0,
        }));
      }
    } catch {
      // Swallow — playlists stays empty
    }

    return res.json({ connected: true, nowPlaying, playlists });
  } catch (err: any) {
    console.error("[Spotify State]", err.message);
    return res.status(500).json({ connected: false, nowPlaying: null, playlists: [] });
  }
}
