# @smarter-poker/commander-shared

Shared code package consumed by both Smarter-Poker World Hub
(`hub-vanguard`) and Smarter-Poker Commander (`smarter-poker-commander`).

## What's in here

| Subdir | Purpose |
|---|---|
| `src/components/` | UI components (avatars, navbars, modals, etc.) shared between hub and commander |
| `src/hooks/` | React hooks (`useDebounce`, realtime, training-bus, wake-lock) |
| `src/engine/` | Cross-app event bus |
| `src/lib/` | Server/client utilities (auth, rate limiting, sentry, supabase client, formatters) |

## Why this exists (Phase 3.3 of the optimization plan)

When Commander was extracted from World Hub on 2026-04-25, ~90
shared utility files got COPIED into the new Commander repo to keep
the migration fast. Both repos started carrying their own duplicate
copy of the same code. Without a single source of truth, any future
fix in one repo would silently fail to apply to the other.

This package is that single source of truth. Both consumer repos
install it as a versioned dep:

```bash
npm install @smarter-poker/commander-shared
```

A bug fix here, bumped to a new version (`0.1.1` etc.), gets picked
up by both consumers on their next deploy.

## Publishing

The package is hosted on GitHub Packages (the npm registry tied to
GitHub). To publish a new version:

```bash
# Edit package.json's "version" field
npm publish
```

`publishConfig.registry` is preset to `https://npm.pkg.github.com`,
so `npm publish` targets GitHub Packages without explicit `--registry`.

Authentication: requires a token with `write:packages` scope. The
publishing token is documented in the team's secret manager.

## Consuming

Both consumers need:

1. `~/.npmrc` configured with a `read:packages`-scoped token to
   pull from the private registry:
   ```
   //npm.pkg.github.com/:_authToken=ghp_...
   @smarter-poker:registry=https://npm.pkg.github.com
   ```
2. Dependency in `package.json`:
   ```json
   "@smarter-poker/commander-shared": "^0.1.0"
   ```
3. Imports rewritten from relative paths to package paths:
   ```js
   // before:
   import { EventBus } from '../../src/engine/EventBus';
   // after:
   import { EventBus } from '@smarter-poker/commander-shared/engine/EventBus';
   ```

## Versioning

Semver. `0.x` while we're stabilizing the API. Breaking changes
allowed in minor bumps until `1.0.0`.

## License

UNLICENSED — internal Smarter-Poker code.
