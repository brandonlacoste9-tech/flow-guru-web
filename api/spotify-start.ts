import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sdk } from "./lib/_core/sdk.js";
import { ENV } from "./lib/_core/env.js";
import {
  buildSpotifyOAuthState,
  getSpotifyCallbackUrl,
} from "./lib/_core/spotify.js";

const SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-modify-playback-state",
  "user-read-playback-state",
  "user-read-currently-playing",
  "streaming",
].join(" ");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      return res.redirect(302, "/?error=auth_required");
    }

    if (!ENV.spotifyClientId) {
      return res.redirect(302, "/?error=spotify_not_configured");
    }

    const state = buildSpotifyOAuthState(user.id);
    const redirectUri = getSpotifyCallbackUrl(req);

    const authUrl = new URL("https://accounts.spotify.com/authorize");
    authUrl.searchParams.set("client_id", ENV.spotifyClientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("show_dialog", "true");

    return res.redirect(302, authUrl.toString());
  } catch {
    return res.redirect(302, "/?error=auth_required");
  }
}
