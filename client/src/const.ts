export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Google Sign-In — redirects to /api/auth/google which handles the full OAuth flow.
export const getLoginUrl = () => "/api/auth/google";
