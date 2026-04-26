import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ENV } from "./lib/_core/env.js";
import { sdk } from "./lib/_core/sdk.js";
import { buildSpotifyOAuthState, getSpotifyCallbackUrl } from "./lib/_core/spotify.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await sdk.authenticateRequest(req as any);
  if (!user) {
    return res.status(401).send("Authentication required");
  }

  const clientId = ENV.spotifyClientId;
  const redirectUri = getSpotifyCallbackUrl(req as any);
  
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

  // Create a signed state with the user's ID
  const state = buildSpotifyOAuthState(user.id);
  spotifyUrl.searchParams.set("state", state);

  res.redirect(spotifyUrl.toString());
}
