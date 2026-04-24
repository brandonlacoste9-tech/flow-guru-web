import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sdk } from "./lib/_core/sdk.js";
import { getProviderConnection } from "./lib/db.js";
import { decryptToken } from "./lib/_core/crypto.js";
import { refreshSpotifyToken } from "./lib/_core/spotify.js";

const SPOTIFY_API = "https://api.spotify.com/v1";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const connection = await getProviderConnection(user.id, "spotify");
    if (!connection || connection.status !== "connected") {
      return res.status(400).json({ error: "Spotify not connected" });
    }

    let token = decryptToken(connection.accessToken);
    const expiresAt = connection.expiresAtUnixMs ? Number(connection.expiresAtUnixMs) : 0;
    if (expiresAt <= Date.now() + 60_000) {
      try {
        token = await refreshSpotifyToken(user.id);
      } catch {
        return res.status(400).json({ error: "Token expired. Please reconnect Spotify." });
      }
    }

    const { contextUri, uris } = req.body as { contextUri?: string; uris?: string[] };

    const body: any = {};
    if (contextUri) body.context_uri = contextUri;
    if (uris) body.uris = uris;

    const playResp = await fetch(`${SPOTIFY_API}/me/player/play`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
    });

    if (playResp.ok || playResp.status === 204) {
      return res.json({ ok: true });
    }

    if (playResp.status === 404) {
      return res.status(404).json({ error: "No active Spotify device found. Open Spotify on your phone or computer." });
    }

    const errText = await playResp.text();
    return res.status(playResp.status).json({ error: errText });
  } catch (err: any) {
    console.error("[Spotify Play]", err.message);
    return res.status(500).json({ error: "Failed to start playback" });
  }
}
