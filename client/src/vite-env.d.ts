/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Browser-only key with Maps Embed API + HTTP referrer restrictions (not your server Maps key). */
  readonly VITE_GOOGLE_MAPS_EMBED_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
