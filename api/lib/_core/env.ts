const clean = (val: string | undefined) => val?.trim().replace(/^["']|["']$/g, "") ?? "";

export const ENV = {
  /** Canonical site URL (no trailing slash). Used for Google OAuth redirect_uri so apex vs www matches Google Console. */
  publicAppUrl: clean(process.env.PUBLIC_APP_URL || process.env.INTEGRATION_BROWSER_BASE || ""),
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: clean(process.env.BUILT_IN_FORGE_API_KEY),
  /** Geocoding + Directions on maps.googleapis.com — enable both APIs in Google Cloud. */
  googleMapsApiKey: clean(process.env.GOOGLE_MAPS_API_KEY),
  deepSeekApiKey: clean(process.env.DEEPSEEK_API_KEY || process.env.DeepSeek_API_KEY || process.env.DEEP_SEEK_API_KEY),
  moonshotApiKey: clean(process.env.MOONSHOT_API_KEY),
  tavilyApiKey: clean(process.env.TAVILY_API_KEY),
  braveApiKey: clean(process.env.BRAVE_API_KEY),
  elevenLabsApiKey: clean(process.env.ELEVENLABS_API_KEY),
  localAiUrl: process.env.LOCAL_AI_URL || "http://localhost:8080",
  useLocalAi: process.env.USE_LOCAL_AI === "true",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_SECRET_KEY ?? "",
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID ?? "",
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? "",
  theNewsApiKey: clean(process.env.THENEWSAPI_API_KEY),
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
};
