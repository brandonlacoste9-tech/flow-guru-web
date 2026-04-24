import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ENV } from "./lib/_core/env.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const clientId = ENV.spotifyClientId;
  const redirectUri = `${ENV.oAuthServerUrl}/api/integrations/spotify/callback`;
  
  if (!clientId) {
    return res.status(500).send("Spotify Client ID not configured");
  }

  const scopes = [
    "user-read-private",
    "user-read-email",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-library-read"
  ].join(" ");

  const spotifyUrl = new URL("https://accounts.spotify.com/authorize");
  spotifyUrl.searchParams.set("response_type", "code");
  spotifyUrl.searchParams.set("client_id", clientId);
  spotifyUrl.searchParams.set("scope", scopes);
  spotifyUrl.searchParams.set("redirect_uri", redirectUri);
  spotifyUrl.searchParams.set("show_dialog", "true");

  // Optional: pass state to prevent CSRF
  const state = req.query.state as string || "floguru";
  spotifyUrl.searchParams.set("state", state);

  res.redirect(spotifyUrl.toString());
}
