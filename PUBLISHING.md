# Shared package delivery

Read `AGENTS.md`, `AGENT-PLAYBOOK.md` and `docs/agent-policy/OPERATING-LAW.md`. Use an owned worktree and branch, ordinary hooks, explicit staged paths, the existing PR or a new one when absent, current required checks and protected squash merge. The authorized agent owns completion; disabled autopilot is not a merge dependency.

The existing `ci.yml` runs Package Integrity and `npm test` on GitHub-hosted compute. These checks must actually pass for the candidate. Verify the protected merged tree. This repository is a source package, not a running application with its own production health endpoint.

World Hub and Commander currently install `file:vendor/commander-shared`. When runtime code is assigned, synchronize only the appropriate reviewed consumer files and lockfiles after upstream integration, preserve intentional consumer overrides, and pass those repositories' existing drift and functional checks. Verify the affected consumer release and behavior through its own `PUBLISHING.md`. A source-only instruction change requires verified source integration; do not invent a runtime redeployment or registry publication.

On failure, diagnose and repair immediately, retain successful evidence for unchanged inputs and rerun the necessary checks through the existing route. Preserve unknown outcomes and operation identity. No watcher, scheduler, background publisher, retired telemetry, manual label or agent-managed release queue is authorized.
