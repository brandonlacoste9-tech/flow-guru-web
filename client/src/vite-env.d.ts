/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Maps Embed API (browser iframe). Often the **same key string** as `GOOGLE_MAPS_API_KEY`:
   * enable **Maps Embed API** on that key and add **HTTP referrer** restrictions for your web origins.
   * Server-side Geocoding/Directions stay on `GOOGLE_MAPS_API_KEY` (never commit that to client-only env files).
   */
  readonly VITE_GOOGLE_MAPS_EMBED_API_KEY?: string;
  /** Optional alias for `VITE_GOOGLE_MAPS_EMBED_API_KEY` if you prefer naming parity with `GOOGLE_MAPS_API_KEY`. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
