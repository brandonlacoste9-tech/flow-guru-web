# Changelog

All notable changes to **Flow Guru** will be documented in this file.

## [1.1.0] - 2026-05-01
### Added
- **Security Hardening**:
    - Added strict Content-Security-Policy (CSP) and HSTS headers in `vercel.json`.
    - Implemented in-memory rate limiting for tRPC `assistant` and `calendar` routers.
- **Code Governance**:
    - Added ESLint configuration and `lint` script.
    - Created comprehensive `README.md` (Sovereign Manual).
- **UX Improvements**:
    - Initial work on loading skeletons and onboarding polish.

### Fixed
- Improved tRPC error formatting for better debugging.
- Fixed inconsistent import paths in `api/lib/routers.ts`.

## [1.0.0] - 2026-04-23
### Added
- Initial release with Clerk Auth and Google Calendar integration.
- "Tan Leather" theme and premium UI components.
- ElevenLabs TTS integration.
- Mobile support via Expo.
