# @smarter-poker/commander-shared

Shared code package consumed by both Smarter-Poker World Hub
(`hub-vanguard`) and Smarter-Poker Commander (`smarter-poker-commander`).

## What's in here

| Subdir | Purpose |
|---|---|
| `src/components/` | UI components (avatars, navbars, modals, etc.) shared between hub and commander |
| `src/hooks/` | React hooks (`useDebounce`, realtime, training-bus, wake-lock) |
| `src/engine/` | Cross-app event bus |
| `src/lib/` | Server/client utilities (auth, rate limiting, local error diagnostics, supabase client, formatters) |

## Why this exists (Phase 3.3 of the optimization plan)

When Commander was extracted from World Hub on 2026-04-25, ~90
shared utility files got COPIED into the new Commander repo to keep
the migration fast. Both repos started carrying their own duplicate
copy of the same code. Without a single source of truth, any future
fix in one repo would silently fail to apply to the other.

This is the maintained upstream source. The current World Hub and Commander consumers install their reviewed `vendor/commander-shared` copies through `file:vendor/commander-shared`. An upstream merge or registry version does not automatically update either consumer.

## Publishing and consuming

Read [AGENTS.md](AGENTS.md) and [PUBLISHING.md](PUBLISHING.md). Use an owned branch, current required integrity/tests and protected merge. For an assigned shared-code delivery, land upstream, sync the appropriate reviewed consumer files and lockfile, and pass each consumer's existing drift and functional gates before its provider release. Keep intentional overrides explicit under the existing ratchet.

`publishConfig` still names GitHub Packages. That configuration is not the active automatic consumer-update route or authorization to publish a package. Only use a registry release when the task explicitly requires it and the consumer contract has been verified. Use configured authenticated tools; never paste token examples, credential values or `.env` contents into instructions.

## Agent execution tooling

`src/lib/agentExecution.mjs` is the shared, Node-only owner for explicit input fingerprints, evidence checks, operation transitions, failure disposition and cost metrics. Import this subpath only from agent/CI tooling, never browser code. Existing approved publishers remain the sole release executors. Consumer-specific check selection belongs in each repository adapter; the shared module does not invent a universal accounting gate. Unknown provider acknowledgements require durable readback before retry.

`executionInventory` and `previewExecution` add a maintained check inventory with explicit owners, commands, invariants, risk tags, input scopes, observed duration and replacement identity. Exact paths and directory scopes replace basename guessing. Unknown paths retain coverage; an unrelated SQL file is not labeled financial by its extension. Required gates remain selected, missing evidence cannot authorize reuse, and overlapping invariants are reported for review rather than automatically deleted. Consumers wire their existing admission decisions separately; these helpers never publish or waive a check.
