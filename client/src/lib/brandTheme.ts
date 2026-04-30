/**
 * Hex colors for `<meta name="theme-color">` and PWA manifest only (no oklch there).
 * Keep in sync with comments / tokens in `client/src/index.css`.
 */
export const BRAND_THEME_COLOR_HEX = {
  /** Light — creamy parchment (matches :root --background leather tone) */
  light: "#f4f1ea",
  /** Dark — deep espresso (matches .dark --background, comment #1a1208) */
  dark: "#1a1208",
} as const;

/*
 * PWA `public/manifest.json` (JSON cannot import TS — mirror by hand):
 *   theme_color:        #b45a14  cognac leather accent (buttons / glow in UI)
 *   background_color:   #130328  Flow Guru night plum splash
 */
