# Otto Hybrid-Core Blueprint

This blueprint reframes Otto from an extension-first loop into an
SDK-driven package with a thin Pi adapter.

It builds on:

- `docs/otto-manifesto.md`
- `docs/otto-dna-roadmap.md`
- `docs/otto-pi-session-capability-matrix.md`
- `docs/otto-runtime-session-detection-design.md`
- `docs/otto-session-reset-install-onboarding-checks.md`

## Why Reframe Otto

The current Otto package is distributed through Pi, but its operating
model is still mostly implemented as a large extension command file in:

- `packages/otto/src/otto.ts`
- `examples/pi-extension/otto.ts`

That prototype proved the loop concept, but it leaves core orchestration
dependent on extension-command affordances such as `ctx.newSession()`.
That makes session continuity, recovery, and resume behavior weaker than
they should be for a system whose product value depends on tight context
and reliable review separation.

The Pi SDK examples point toward a stronger design:

- Otto should own session lifecycle directly through
  `createAgentSession(...)` and `SessionManager`
- Pi should remain an important interface, but not the orchestration
  substrate
- session continuity should be a core Otto policy, not an extension
  implementation side effect

## Product Goal

Otto should become a package with a reusable execution engine that can:

- create and resume its own managed sessions
- preserve the closed-loop BMAD + `td` operating model
- support Pi-native interactive control without making Pi extension
  context the source of truth for core state
- support future headless or CLI-driven runs from the same engine

## Target Architecture

Otto should be split into three layers.

### 1. `otto-core`

The engine layer. This owns:

- the run state machine
- continuity policy and session policy
- next-step loop orchestration
- checkpointing and recovery state
- evidence classification and weak-signal handling
- `td` integration and queue-state interpretation
- PRD validation handoff logic

This layer should not depend on Pi extension command types.

### 2. `otto-session-backend`

The SDK-facing session layer. This owns:

- `createAgentSession(...)` calls
- `SessionManager.create(...)`
- `SessionManager.continueRecent(...)`
- `SessionManager.open(...)`
- `SessionManager.list(...)`
- Otto-specific session directory policy
- session metadata and run-session association

This layer turns Pi SDK session primitives into Otto session semantics.

### 3. `otto-pi-adapter`

The Pi-facing control and UI layer. This owns:

- registering Pi package commands
- rendering widget and status output
- operator prompts and onboarding choices
- mapping Pi command invocations to core operations
- optional bridging to the active interactive Pi experience

This layer should be thin. It should delegate decisions to core instead
of implementing the loop itself.

## Current Code Extraction Map

Most of Otto's logic currently lives in one file:

- `packages/otto/src/otto.ts`

The file should be treated as an extraction source, not a permanent home.

### Move into `otto-core`

These responsibilities belong in the engine:

- run state types such as `RunState`, `Checkpoint`, `StopCode`, and queue
  state
- autonomy mode resolution and policy summaries
- workflow command selection and iteration rules
- queue-drain logic and `td` work detection
- evidence/result classification integration with `otto-result.mjs`
- stop, pause, resume, and failure-budget transitions
- checkpoint creation and dive metadata planning

### Move into `otto-session-backend`

These responsibilities should stop living in the extension layer:

- fresh-session versus same-session continuity decisions
- session creation and session resume behavior
- explicit mapping between Otto runs and SDK session files
- any future `list`, `open`, `continue recent`, or fork support for Otto
  sessions
- durable storage for session policy and capability status

### Keep in `otto-pi-adapter`

These responsibilities are genuinely Pi-facing:

- command registration for `/otto-start`, `/otto-status`, `/otto-dive`,
  `/otto-onboard`, and future `/otto-check`
- interactive onboarding prompts
- widget rendering and `ctx.ui.notify(...)`
- any Pi-only affordances that do not belong in the core execution model

### Eliminate or simplify during extraction

These prototype seams should disappear:

- source-of-truth duplication between
  `examples/pi-extension/otto.ts` and `packages/otto/src/otto.ts`
- `scripts/sync-otto.mjs` as the mechanism for keeping runtime logic in
  sync
- direct dependence on `ExtensionCommandContext.newSession()` for the
  primary continuity mechanism

## Proposed Package Layout

One reasonable monorepo shape is:

```text
packages/
  otto-core/
    src/
      engine/
      policies/
      state/
      checkpoints/
      td/
      validation/
  otto-sdk-runtime/
    src/
      sessions/
      agent/
      storage/
  otto/
    src/
      pi-adapter/
      index.ts
    skills/
```

If the extra package count feels too heavy early on, `otto-core` and the
SDK runtime layer can start as subdirectories under `packages/otto/src`
and split later.

The key requirement is architectural separation, not immediate package
proliferation.

## Core Interfaces

The first refactor step should define explicit interfaces before moving
code.

### Session runtime interface

This is the most important new boundary.

Suggested shape:

```ts
interface OttoSessionRuntime {
  createRunSession(options?: OttoSessionOptions): Promise<OttoSessionHandle>;
  continueRunSession(runId: string): Promise<OttoSessionHandle>;
  openSession(sessionIdOrPath: string): Promise<OttoSessionHandle>;
  listSessions(filter?: OttoSessionFilter): Promise<OttoSessionInfo[]>;
  rotateSession(handle: OttoSessionHandle): Promise<OttoSessionHandle>;
}
```

Otto core should ask for a session runtime capability, not call Pi
extension context methods directly.

### Command execution interface

Suggested shape:

```ts
interface OttoCommandExecutor {
  queueWorkflowCommand(command: string, prompt: string): Promise<void>;
  executeShell(
    command: string,
    args: string[],
    timeout?: number,
  ): Promise<ExecResult>;
}
```

This lets Pi-backed execution and future CLI-backed execution share the
same engine.

### Operator UI interface

Suggested shape:

```ts
interface OttoOperatorUi {
  notify(
    message: string,
    level: "info" | "warning" | "error" | "success",
  ): void;
  choose<T>(
    title: string,
    options: Array<{ label: string; value: T }>,
  ): Promise<T | null>;
  renderStatus(snapshot: OttoStatusSnapshot): void;
}
```

The core should emit status snapshots and events, not render Pi UI
strings itself.

## Session Model

Otto should treat sessions as a first-class product concern.

### Recommended session policy model

Adopt the policy already described in the session-reset design docs:

- `require-fresh`
- `allow-compatibility`

But move enforcement into the SDK-backed session runtime rather than
relying on Pi extension capability checks alone.

### Recommended managed session behavior

For each Otto run:

- create or resume a named Otto session set
- associate checkpoints with SDK session IDs and paths
- allow `continueRecent` to recover the latest Otto-managed session for a
  run or workspace
- allow listing and opening sessions for debugging and operator recovery

### Recommended storage rules

Otto should decide and document:

- whether to use Pi's default encoded per-cwd session dir
- whether to use a custom Otto session directory
- how Otto run IDs map to session metadata
- how current run state maps to session state versus sidecar config state

Recommended default:

- use a custom Otto-managed session directory under the project or Otto
  agent directory so Otto sessions are easy to inspect and do not depend
  on implicit extension behavior

## Pi Adapter Role After Refactor

Pi remains important, but its job changes.

### Pi should still provide

- package install and discovery
- command palette and slash-command UX
- widget rendering and session-tree affordances
- an interactive operator surface for Otto control

### Pi should stop being responsible for

- the authoritative Otto run loop
- session rotation policy decisions
- continuity recovery logic
- the only way Otto can start or resume work

In the target design, the Pi adapter becomes a controller and viewer for
the Otto engine.

## Command Compatibility Plan

Current commands should remain user-facing, but their implementation
should move behind the adapter boundary.

### Keep

- `/otto-onboard`
- `/otto-start`
- `/otto-status`
- `/otto-pause`
- `/otto-resume`
- `/otto-stop`
- `/otto-dive`
- `/otto-check`

### Reinterpret

- `/otto-start` should start or attach to an Otto-managed SDK session set
- `/otto-resume` should resume the current Otto run through Otto's own
  persisted state, not only the current Pi chat context
- `/otto-dive` should navigate Otto checkpoint metadata that references
  SDK sessions
- `/otto-check` should report runtime capability, configured policy,
  session directory, and recoverable sessions

## Migration Phases

### Phase 1. Stabilize architecture boundaries

Goal:

- stop adding new orchestration behavior directly to
  `packages/otto/src/otto.ts`

Deliverables:

- define core interfaces for session runtime, command execution, and UI
- document current extraction boundaries
- mark `examples/pi-extension/otto.ts` as prototype legacy once the new
  structure begins

### Phase 2. Extract the state machine

Goal:

- move run-state, queue-state, and stop-state logic into core

Deliverables:

- pure TypeScript modules for run transitions
- testable iteration logic without Pi command context
- explicit event model for status and checkpoints

### Phase 3. Build the SDK session runtime

Goal:

- replace extension-driven continuity with Otto-managed sessions

Deliverables:

- `create`, `continueRecent`, `open`, and `list` support through
  `SessionManager`
- Otto run/session association model
- explicit handling for fresh-session, compatibility mode, cancellation,
  and failure

### Phase 4. Rebuild the Pi integration as an adapter

Goal:

- preserve Pi-native usability without keeping the old architecture

Deliverables:

- thin command handlers that call core services
- widget and status surfaces fed by core snapshots
- onboarding and `/otto-check` backed by the new runtime abstractions

### Phase 5. Add non-Pi entrypoints

Goal:

- prove Otto is a package, not just an extension

Deliverables:

- CLI or daemon-style entrypoint for headless operation
- session inspection and resume tooling
- support for automation outside a live Pi interactive command session

### Phase 6. Remove prototype duplication

Goal:

- collapse source-of-truth confusion

Deliverables:

- retire `scripts/sync-otto.mjs`
- remove duplicated extension source files
- make package source the only implementation source of truth

## File-By-File Extraction Blueprint

The current file can be split roughly like this.

### `packages/otto/src/otto.ts`

Extract into core modules:

- state types and defaults
- policy resolution
- workflow decision loop
- failure and stop handling
- checkpoint serialization
- queue-drain interpretation

Extract into adapter modules:

- Pi command registration
- Pi event registration
- onboarding prompt wiring
- widget/status rendering

Replace with:

- a thin composition root that wires the Pi adapter to Otto core

### `packages/otto/src/otto-result.mjs`

Keep as a classification utility initially, but move behind a stable core
interface so the engine depends on evidence signals, not file-local
helpers.

### `examples/pi-extension/otto.ts`

Stop treating this as a source-of-truth file. During migration it should
either:

- become a minimal adapter example built from package exports, or
- be removed once package-driven Pi installation is the only supported
  path

### `packages/otto/README.md`

Update once the architecture begins to land:

- Otto is an SDK-powered package with Pi integration
- Pi is the primary UX surface, not the only runtime shape
- session management is owned by Otto's managed runtime

## Open Design Questions

These should be settled early because they change the implementation
shape.

### 1. Session ownership model

Should Otto runs:

- create isolated Otto-managed sessions that are separate from the
  operator's ambient chat sessions, or
- deliberately attach to the current user session tree when started from
  Pi?

Recommended default:

- isolated Otto-managed sessions with explicit linking metadata

### 2. Runtime process model

Should the Pi adapter:

- run Otto core in-process, or
- control a separate Otto runtime process?

Recommended default:

- start in-process for migration speed, but keep interfaces clean enough
  that a separate process remains possible later

### 3. Session directory policy

Should Otto:

- use Pi's default encoded per-cwd session location, or
- use a custom Otto-specific directory?

Recommended default:

- use a custom Otto-specific directory or naming convention so recovery,
  debugging, and support workflows are easier

### 4. Dive semantics

Should `/otto-dive`:

- navigate within a single managed session tree, or
- open/fork historical Otto-managed sessions tied to checkpoints?

Recommended default:

- support checkpoint-to-session mapping so dive works across explicit Otto
  session boundaries

## Acceptance Criteria For The Refactor

The architecture shift is successful when all of the following are true:

- Otto can start, resume, and inspect runs through SDK-managed sessions
  without depending on `ctx.newSession()` as the primary continuity path
- Pi commands still provide a smooth operator experience
- core orchestration logic is testable without Pi extension command
  context
- run state and session state are explicit and recoverable
- package source is the single implementation source of truth
- compatibility fallback is explicit policy, not silent degradation

## Recommended Immediate Implementation Sequence

1. define the core interfaces and move type/state definitions first
2. extract the run-state machine into pure modules
3. implement an SDK-backed session runtime behind a stable interface
4. rewire `/otto-start`, `/otto-resume`, and `/otto-status` through the
   new core
5. add `/otto-check` on top of the new runtime and policy model
6. remove the example-package duplication once the adapter is stable

This keeps the first milestone focused on architecture and session
ownership, not on polishing every command at once.
