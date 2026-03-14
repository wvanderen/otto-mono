# Otto Runtime Session Detection Design

This note defines how Otto should detect Pi session-reset capability at
runtime and how Otto should behave when that capability is missing.

It builds on:

- `docs/otto-pi-session-capability-matrix.md`
- `docs/otto-session-reset-support-plan.md`

## Problem

Current Otto behavior feature-detects `ctx.newSession()` only at the
moment a session hop is attempted. If the API is missing or the call
fails, Otto silently falls back to same-session compaction.

That behavior keeps the loop moving, but it hides a material loss of
guarantees:

- weaker `td` review separation
- weaker context-boundary discipline during long runs
- confusing support posture for users who expect full Otto mode

## Current Runtime Touchpoints

Current code paths that matter:

- `packages/otto/src/otto.ts:1420` feature-detects `ctx.newSession`
- `packages/otto/src/otto.ts:1426` falls back when the API is absent
- `packages/otto/src/otto.ts:1457` falls back when rotation throws
- `packages/otto/src/otto.ts:2062` starts the Otto loop
- `packages/otto/src/otto.ts:2144` reports status via `/otto-status`
- `packages/otto/src/otto.ts:413` builds widget lines

## Design Goals

- detect capability before a long run depends on it
- distinguish missing capability from cancelled rotation and runtime error
- make support level visible in widget, status, and stop reasons
- fail fast by default when full-mode guarantees are unavailable
- allow degraded same-session continuation only when explicitly enabled

## Capability Model

Define runtime capability in three states:

| State         | Meaning                                                                |
| ------------- | ---------------------------------------------------------------------- |
| `supported`   | Pi exposes `ctx.newSession()` and Otto may use full fresh-session mode |
| `unavailable` | Pi does not expose `ctx.newSession()` in the current command context   |
| `failed`      | Pi exposed the API, but a rotation attempt failed unexpectedly         |

Also track a separate rotation outcome state:

| Outcome         | Meaning                                    |
| --------------- | ------------------------------------------ |
| `not-attempted` | No session rotation has been attempted yet |
| `success`       | Rotation succeeded                         |
| `cancelled`     | Rotation was explicitly cancelled          |
| `failed`        | Rotation threw or otherwise failed         |

This keeps capability absence distinct from operational failure.

## Runtime Policy

### Default behavior

Default Otto behavior should require fresh-session support.

If the operator starts Otto in a configuration that expects
fresh-session-between-steps and the runtime does not expose
`ctx.newSession()`, Otto should fail fast before the loop proceeds.

### Compatibility mode

Same-session continuation remains acceptable only when the operator has
explicitly opted into compatibility behavior.

That opt-in can be expressed through a future config or CLI policy, but
the runtime rule should be:

- missing fresh-session capability + no compatibility opt-in = fail fast
- missing fresh-session capability + compatibility opt-in = warn and run
  in degraded mode

## Detection Flow

### Start-time check

During `/otto-start`:

1. derive whether the run expects fresh-session continuation
2. detect `typeof ctx.newSession === "function"`
3. record support level in run state
4. if unsupported and compatibility mode is not enabled, stop before the
   first workflow command is queued

Detection should stay on Otto's public Pi contract boundary. Otto should
rely on whether `ExtensionCommandContext.newSession()` is available and
whether it returns `{ cancelled: true }` or throws. Otto should not make
runtime decisions from Pi's internal session-version details or
extension-runner internals, because those are implementation details
behind the `newSession()` contract.

Why start-time detection matters:

- users learn the environment is incompatible immediately
- `otto-status` is truthful before any iteration begins
- long autonomous runs do not begin under false assumptions

### Rotation-time check

When a fresh-session hop is about to happen:

- reuse the recorded capability state
- re-check `ctx.newSession` defensively in case the runtime surface
  changed
- record `cancelled` versus `failed` outcomes distinctly

Why keep both checks:

- start-time check gives fast feedback
- rotation-time check protects against runtime drift or edge cases

## User-Facing Behavior

### Supported runtime

Show that Otto is in full support mode.

Recommended status language:

- `Session support: full (fresh-session available)`
- `Continuity policy: require fresh session`

### Unsupported runtime, strict/default mode

Stop immediately with an explicit unsupported-runtime message.

Recommended message shape:

- `Otto requires Pi fresh-session support for full mode, but ctx.newSession() is unavailable in this runtime.`
- `Remediation: upgrade Pi or run Otto in explicit compatibility mode if same-session continuation is acceptable.`

Recommended stop code:

- `session-rotation-unsupported`

### Unsupported runtime, compatibility mode

Continue only after a visible warning.

Recommended warning shape:

- `Pi fresh-session support is unavailable; Otto is continuing in same-session compatibility mode with reduced review-separation guarantees.`

Recommended continuity state:

- `same-session-compacted`

### Cancelled rotation

Stop the run and preserve the distinction from unsupported runtime.

Recommended stop code:

- keep `session-rotation-cancelled`

### Rotation failure

Unexpected runtime failure after capability was initially available should
not be treated as simple incompatibility.

Recommended stop code:

- `session-rotation-failed`

Default behavior recommendation:

- stop in strict/default mode
- optionally continue only in explicit compatibility mode, with an error
  level warning

## State And UI Changes

Add run-state fields for capability and policy visibility.

Recommended additions:

- `sessionSupport: "unknown" | "supported" | "unavailable" | "failed"`
- `sessionPolicy: "require-fresh" | "allow-compatibility"`
- `lastSessionRotation: "not-attempted" | "success" | "cancelled" | "failed"`

Update UI surfaces:

- widget should show session support and policy near current continuity
- `/otto-status` should report support state, policy, and last rotation
  outcome
- stop reason text should explain guarantee loss, not just the mechanical
  failure

## Proposed Stop Codes

Extend the stop-code model with:

- `session-rotation-unsupported`
- `session-rotation-failed`

Retain:

- `session-rotation-cancelled`

This gives product-meaningful differentiation between unsupported
environment, operator cancellation, and unexpected runtime failure.

## Acceptance Of Silent Degradation

Silent degradation should be removed from default Otto behavior.

Allowed behavior after this design lands:

- explicit compatibility fallback with warning

Disallowed behavior:

- automatic fallback from required fresh-session mode into same-session
  compaction without a visible downgrade decision

## Implementation Outline

1. add runtime state fields for session support and policy
2. evaluate capability in `/otto-start`
3. block queueing the first workflow command when capability is required
   but unavailable
4. update rotation handling to differentiate unavailable, cancelled, and
   failed outcomes
5. update widget and `/otto-status` output
6. align onboarding, install checks, and docs with the runtime behavior

## Follow-On Dependencies

- `td-fce68f` should define install, onboarding, and doctor checks around
  the same capability model
- `td-87d0e8` should update troubleshooting and minimum-environment docs
  to match these stop codes and support tiers
