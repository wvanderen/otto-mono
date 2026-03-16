# Otto Hybrid-Core Migration Status

Last updated: 2026-03-16

This document records what has landed from the hybrid-core migration,
what remains, and how the current `td` backlog maps to reality.

Primary planning reference:

- `docs/otto-hybrid-core-blueprint.md`

## Current Read

Migration status is best described as early-to-mid extraction.

- the package is now the runtime source of truth
- Otto has a real package-owned core/runtime/pi-adapter structure under
  `packages/otto/src/`
- the live Otto entrypoint in `packages/otto/src/otto.ts` now consumes
  shared package-owned services and helpers for significant parts of the
  loop
- the monolithic `otto.ts` file still contains the deepest orchestration
  branch, especially the remaining `agent_end` decision tree and some Pi
  persistence/event glue

## What Has Landed

### Package source of truth

- `scripts/sync-otto.mjs` now syncs from `packages/otto/` into
  `examples/pi-extension/` and `.pi/extensions/`
- package-owned runtime code is now authoritative
- example and local extension copies are mirrors, not the source

### Core extraction

These package-owned modules now exist and are actively used:

- `packages/otto/src/core/contracts.ts`
- `packages/otto/src/core/state.ts`
- `packages/otto/src/core/service.ts`
- `packages/otto/src/core/orchestration.ts`
- `packages/otto/src/core/status-report.ts`
- `packages/otto/src/core/loop-control.ts`
- `packages/otto/src/core/event-state.ts`
- `packages/otto/src/core/agent-result.ts`

The package contracts now explicitly document boundary ownership:

- core owns stable interfaces for session runtime, command execution,
  operator UI, and session-control affordances
- `OttoCoreState` is the shared run-state payload that orchestration owns
  independently of Pi UI/runtime wiring
- Pi adapter implementations now conform to those package-owned contracts
  instead of relying on ad hoc extension-context calls in `otto.ts`

These modules now own substantial behavior that used to live inline in
`packages/otto/src/otto.ts`, including:

- state models and state transitions
- workflow queue bookkeeping
- queue-drain, td-drift, and PRD-validation routing decisions
- stop and failure handling helpers
- status rendering inputs
- event-state bookkeeping
- workflow result application and checkpoint mutation
- queue progression updates

### SDK-backed runtime extraction

`packages/otto/src/runtime/session-runtime.ts` now provides an Otto
runtime wrapper over Pi SDK session APIs:

- `createAgentSession(...)`
- `SessionManager.create(...)`
- `SessionManager.continueRecent(...)`
- `SessionManager.open(...)`
- `SessionManager.list(...)`

Current runtime additions include:

- Otto-managed session directory defaults
- Otto runtime metadata storage under `.pi/otto/runtime/`
- a session index for run-to-session association
- session policy/support metadata returned to Otto state

This is real progress, but it is not yet the sole runtime control path.

### Pi adapter extraction

The Pi adapter now has real responsibilities under:

- `packages/otto/src/pi-adapter/commands.ts`
- `packages/otto/src/pi-adapter/ui.ts`
- `packages/otto/src/pi-adapter/session-control.ts`
- `packages/otto/src/pi-adapter/composition.ts`

The adapter now owns:

- message dispatch and follow-up delivery choices
- operator notifications and selection helpers
- fresh-session rotation wrapping
- compaction wrapping
- cached service bundle creation per context

### Live runtime integration

The live Otto entrypoint now uses the extracted package modules for:

- `/otto-start`
- `/otto-resume`
- `/otto-status`
- onboarding choices
- pause/stop/dive notifications
- fresh-session and compaction routing
- state transition helpers
- status-report helpers
- event-state bookkeeping
- agent-result bookkeeping
- queue progression helpers
- fresh-session continuation through the adapter-owned session-control
  contract rather than direct `ctx.newSession()` calls

## What Is Still Missing

### Remaining monolith work in `packages/otto/src/otto.ts`

The biggest remaining extraction target is still the deeper
`agent_end` processing logic. In particular, these areas still live too
close to Pi event wiring:

- some drift/validation sequencing still lives inside the event handler
- final persistence ordering around queue/drain transitions still lives in
  the entrypoint
- some iteration continuation logic
- event-handler composition and persistence ordering

### Runtime migration gaps

The SDK runtime exists, but the overall migration is not complete yet:

- Otto still uses Pi event/session affordances directly in some places
- `/otto-continue` now uses the adapter-owned session-control boundary, but
  full continuation flow is still orchestrated from `otto.ts`
- runtime diagnostics such as `/otto-check` are not implemented on the new
  abstractions yet
- session inspection and operator recovery surfaces are still incomplete

### Prototype removal gaps

The source-of-truth problem is much better, but prototype duplication has
not been retired yet:

- sync still mirrors package files into example and project-local copies
- `scripts/sync-otto.mjs` still exists as a transitional mechanism
- the example extension has not yet collapsed into a thin adapter-only
  example

## td Backlog Accuracy

Current `td` issues are directionally accurate, with a few important notes:

- `td-34c380` is carrying most of the extraction work that has landed so
  far and remains the active implementation issue for this session
- `td-1daf8b` is still relevant, but some of its groundwork has already
  landed through the session runtime wrapper and session metadata work
- `td-cf544f` is still relevant, but meaningful pieces of that adapter
  extraction are already in place
- `td-8c055d` is now mostly satisfied by this document,
  `docs/otto-hybrid-core-blueprint.md`, and the synchronized top-level Otto
  READMEs; keep it open only while follow-through docs still need to stay in
  sync with migration reality
- Otto start/resume now need to treat the live Pi conversation as the
  source of truth and only use the SDK runtime for run metadata and
  session discovery, not detached workflow dispatch
- `td-4e5163`, `td-ef8c0e`, and `td-8c055d` remain substantially future
  work

So the backlog is still valid, but the first three tasks now overlap in a
more incremental way than the original clean phase boundaries implied.

## Recommended td Interpretation

- keep `td-34c380` as the current in-progress extraction issue until the
  remaining `otto.ts` monolith split is meaningfully further along or the
  team wants to close it and start a narrower follow-on task
- treat `td-1daf8b` as partially de-risked but not complete
- treat `td-cf544f` as partially started but not complete
- leave the remaining tasks open

## Recommended Next Steps

1. keep extracting the remaining `agent_end` decision tree into core
   helpers
2. move `/otto-resume` and any remaining direct session affordances
   behind the runtime/adapter boundary
3. add an explicit runtime diagnostic surface such as `/otto-check`
4. decide when `td-34c380` is considered complete and whether to move the
   next implementation session onto `td-1daf8b` or `td-cf544f`

## Documentation Follow-Through

The architecture docs are now in place, but user-facing package docs still
need to stay synchronized with them.

- `packages/otto/README.md` should remain the primary operator-facing entry
  point and must describe the current hybrid-core status without implying
  the migration is finished
- `examples/pi-extension/README.md` should continue framing the local
  extension copy as a transitional mirror of the package-owned source
- future Otto docs should link both the blueprint and this migration-status
  document when describing packaging, migration phases, or runtime
  ownership

## Handoff Notes

If a new session picks this up, start by reading:

- `docs/otto-hybrid-core-blueprint.md`
- `docs/otto-hybrid-core-migration-status.md`
- `packages/otto/src/core/`
- `packages/otto/src/pi-adapter/`
- `packages/otto/src/runtime/session-runtime.ts`
- `packages/otto/src/otto.ts`

The clearest next extraction target is the remainder of the `agent_end`
branch in `packages/otto/src/otto.ts`.
