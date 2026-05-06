import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  connectSpotify,
  getSpotifyCallbackUrl,
  parseSpotifyOAuthState,
} from "./lib/_core/spotify.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = req.query.code as string;
  const state = req.query.state as string;
  const error = req.query.error as string;

  if (error) {
    console.warn("[Spotify Callback] Access denied by user.", error);
    return res.redirect(302, "/settings?error=spotify_denied");
  }

  if (!code || !state) {
    return res.redirect(302, "/settings?error=spotify_invalid_callback");
  }

  try {
    const { userId } = parseSpotifyOAuthState(state);
    const redirectUri = getSpotifyCallbackUrl(req);

    await connectSpotify({
      userId,
      code,
      redirectUri,
    });

    return res.redirect(302, "/settings?success=spotify_connected");
  } catch (err: any) {
    console.error("[Spotify Callback] Connection failed.", err.message);
    return res.redirect(302, `/settings?error=spotify_connection_failed&msg=${encodeURIComponent(err.message)}`);
  }
}
