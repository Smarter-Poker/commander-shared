# Shared package delivery

**Non-engine delivery: push, publish, verify and finish without waiting for `:55`.** Apply the maintenance cutover only to an actual engine replacement or a specifically identified dependency on new engine behavior. A Club Arena client using existing engine APIs, an unrelated pending engine release, and a generic engine-health check do not create that dependency. Required checks and normal client publication/live proof still apply.

Read `AGENTS.md`, `AGENT-PLAYBOOK.md` and `docs/agent-policy/OPERATING-LAW.md`. Use an owned worktree and branch, ordinary hooks, explicit staged paths, the existing PR or a new one when absent, current required checks and protected squash merge. The authorized agent owns completion; disabled autopilot is not a merge dependency.

The existing `ci.yml` runs Package Integrity and `npm test` on GitHub-hosted compute. These checks must actually pass for the candidate. Verify the protected merged tree. This repository is a source package, not a running application with its own production health endpoint.

World Hub and Commander currently install `file:vendor/commander-shared`. When runtime code is assigned, synchronize only the appropriate reviewed consumer files and lockfiles after upstream integration, preserve intentional consumer overrides, and pass those repositories' existing drift and functional checks. Verify the affected consumer release and behavior through its own `PUBLISHING.md`. A source-only instruction change requires verified source integration; do not invent a runtime redeployment or registry publication.

On failure, diagnose and repair immediately, retain successful evidence for unchanged inputs and rerun the necessary checks through the existing route. Preserve unknown outcomes and operation identity. No watcher, scheduler, background publisher, retired telemetry, manual label or agent-managed release queue is authorized.

## Publication timing

Push ready changes, run checks, complete protected merge, build and stage as soon as their prerequisites pass, throughout the hour. Do not hold these stages until `:55`. World Hub and Club Arena client publication have no hourly gate. Only game-engine activation uses its certified maintenance window; the immutable image must be prepared beforehand, followed by immediate live identity, behavior and rollback-budget verification at cutover. Commander and shared-package delivery retain their own component rules above. See the operating law for failed-attempt recovery.

## Before submission

Run the applicable local prechecks on the final candidate before push, as required by `docs/agent-policy/OWNER-POLICY.md`. Include source contracts reading changed Markdown/workflows/scripts and qualification manifests, not only imported-code tests. Resolve missing or stale owned dependencies and actual failures before submission; never defer an available local check to the first hosted run. Record exact input and results in the task checkpoint. Hosted CI, protected merge, publisher admission and applicable live proof remain mandatory.
