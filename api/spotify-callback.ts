import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sdk } from "./lib/_core/sdk.js";
import { connectSpotify, parseSpotifyOAuthState, getSpotifyCallbackUrl } from "./lib/_core/spotify.js";
import { upsertProviderConnection } from "./lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;

  if (!code || !state) {
    return res.status(400).send("Callback requires code and state");
  }

  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      return res.status(401).send("Authentication required");
    }

    const { userId } = parseSpotifyOAuthState(state);
    if (userId !== user.id) {
      return res.status(403).send("User ID mismatch");
    }

    const result = await connectSpotify({
      userId: user.id,
      code,
      redirectUri: getSpotifyCallbackUrl(req),
    });

    // Success! Redirect to home with a success flag
    res.redirect(`/?integration=spotify&status=connected&account=${encodeURIComponent(result.externalAccountLabel)}`);
    
  } catch (error: any) {
    console.error("[Spotify Callback Error]", error);
    res.redirect(`/?integration=spotify&status=error&message=${encodeURIComponent(error.message)}`);
  }
}
