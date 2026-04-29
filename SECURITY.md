# Security Policy

## Supported Versions

Flow Guru Web is a continuously deployed application; security fixes are applied to the `main` branch and rolled out via Vercel. Older deployments are not separately patched.

| Branch | Supported |
| :-- | :-- |
| `main` (production) | ✅ |
| Feature branches / forks | ❌ |

## Reporting a Vulnerability

If you discover a security vulnerability, **please do not open a public GitHub issue**. Instead, use one of the following channels:

1. **Preferred:** GitHub's Private Vulnerability Reporting at <https://github.com/brandonlacoste9-tech/flow-guru-web/security/advisories/new>
2. Email the maintainer (see commit history for contact)

When reporting, please include:

- A clear description of the issue and its impact
- Steps to reproduce (proof-of-concept if possible)
- Affected versions / commit SHAs
- Any suggested mitigation

## Response Targets

- **Acknowledgement:** within 72 hours
- **Initial assessment:** within 7 days
- **Fix or mitigation:** prioritized by severity (CVSS):
  - Critical / High: as soon as practical, typically within 14 days
  - Moderate: within 30 days
  - Low: best-effort

## Scope

In scope:

- The production site **`https://floguru.com`** (apex; **`https://www.floguru.com`** redirects here)
- The default Vercel hostname **`https://flow-guru-web.vercel.app`** and other **`*.vercel.app`** preview deployments for this repo
- Source code in this repository, including the API layer (`api/`), server (`server/`), client (`client/`), and mobile app (`mobile/`)

Out of scope:

- Third-party services (Neon, Supabase, Vercel, Spotify, Google) — report directly to those providers
- Social engineering, physical attacks, or DoS that requires excessive volume
- Issues in dependencies already tracked by Dependabot (see open alerts and tracking issues)

## Safe Harbor

Good-faith research conducted within this policy will not be pursued legally. Please make every effort to avoid privacy violations, data destruction, and service disruption while testing.

## Hardening Status

- ✅ Dependabot alerts enabled
- ✅ Dependabot version updates configured (`.github/dependabot.yml`)
- ⏳ CodeQL code scanning — enable in GitHub → Settings → Security → Code security and analysis
- ⏳ Secret scanning — enable GitHub secret scanning for the repository (recommended)
- ⏳ Confirm **Private vulnerability reporting** is enabled (repo **Settings → Security**); reporting link: `https://github.com/brandonlacoste9-tech/flow-guru-web/security/advisories/new`
