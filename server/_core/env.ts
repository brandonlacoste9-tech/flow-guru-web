const clean = (val: string | undefined) =>
  (val ?? "")
    .replace(/^\uFEFF/, "") // strip BOM from .env files
    .trim()
    .replace(/^["']|["']$/g, "");

/** Live env reads (safe on Vercel cold starts / late dotenv load). */
export function getXaiApiKey() {
  return clean(
    process.env.XAI_API_KEY ||
      process.env.GROK_API_KEY ||
      process.env.XAI_KEY ||
      process.env.GROK_KEY ||
      process.env.X_AI_API_KEY
  );
}
export function getXaiModel() {
  return clean(process.env.XAI_MODEL || process.env.GROK_MODEL) || "grok-4.3";
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: clean(process.env.BUILT_IN_FORGE_API_KEY),
  googleMapsApiKey: clean(process.env.GOOGLE_MAPS_API_KEY),
  /** xAI Grok (OpenAI-compatible). Preferred chat provider when set.
   *  Prefer getXaiApiKey()/getXaiModel() at call-time; these are bootstrap snapshots. */
  xaiApiKey: clean(process.env.XAI_API_KEY || process.env.GROK_API_KEY),
  xaiModel: clean(process.env.XAI_MODEL) || "grok-4.3",
  deepSeekApiKey: clean(process.env.DEEPSEEK_API_KEY || process.env.DeepSeek_API_KEY || process.env.DEEP_SEEK_API_KEY),
  moonshotApiKey: clean(process.env.MOONSHOT_API_KEY),
  elevenLabsApiKey: clean(process.env.ELEVENLABS_API_KEY),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID ?? "",
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID ?? "",
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? "",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
};
