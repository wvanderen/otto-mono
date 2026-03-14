# Otto Session Reset Support Plan

This plan turns Pi fresh-session support from a best-effort behavior into
an explicit Otto product requirement.

It builds on `docs/otto-pi-session-capability-matrix.md`, which confirms
that Otto can depend on `ExtensionCommandContext.newSession()` for full
support but cannot depend on any extension-safe in-place clear-context
API.

## Product Goal

Otto should either:

- run in a Pi environment that supports extension-driven fresh-session
  rotation and clearly advertise full support, or
- detect that the capability is missing and clearly report that the
  environment is incompatible with Otto full mode.

The main product point is trust. Users who rely on Otto for sustained
delivery and `td` review separation should not discover late in a run
that session rotation was only a silent best effort.

## Policy Decision

### Full-mode requirement

Treat native Pi fresh-session support as a hard requirement for Otto full
mode.

Concretely, a fully supported Otto environment must expose:

- `ctx.newSession()` on extension command contexts

### Fallback policy

Same-session compaction can remain available only as a compatibility or
operator-selected fallback. It should not be presented as equivalent to
fresh-session continuation.

Implications:

- no silent downgrade from fresh-session mode to compaction-only mode
- unsupported runtimes must surface reduced guarantees explicitly
- docs and onboarding should describe compaction as degraded behavior

### Recommended default behavior

- default Otto mode: require fresh-session capability
- optional compatibility mode: allow same-session continuation with clear
  warnings and reduced-support messaging

## Work Areas

### 1. Runtime Capability Detection

Goal: detect support before or at run start and make the current support
level visible.

Design direction:

- feature-detect `typeof ctx.newSession === "function"`
- evaluate capability when Otto starts and when a loop iteration would
  rotate sessions
- store capability state in Otto run state so widget, status, and stop
  reasons can report it consistently

Desired outcomes:

- supported environments show that fresh-session mode is active
- unsupported environments show that full mode is unavailable
- cancellation or runtime failure of `newSession()` is distinguished from
  capability absence

Primary follow-up issue:

- `td-2bebc1` Design Otto runtime detection and fail-fast session reset behavior

### 2. Fail-Fast Runtime Behavior

Goal: avoid pretending Otto is operating normally when a core guarantee is
missing.

Design direction:

- fail fast when fresh-session is required but unavailable
- use explicit stop codes and status text for unsupported runtime,
  cancelled rotation, and unexpected rotation failure
- only continue in same-session mode when the operator explicitly opted
  into compatibility behavior

Desired outcomes:

- no silent degradation from full mode into compaction-only mode
- user-facing messaging explains what guarantee is lost
- `otto-status` and notifications identify the exact reason Otto paused or
  downgraded

Primary follow-up issue:

- `td-2bebc1` Design Otto runtime detection and fail-fast session reset behavior

### 3. Install, Onboarding, And Doctor Checks

Goal: catch unsupported environments before a long run begins.

Design direction:

- installation guidance should call out Pi capability prerequisites
- onboarding should verify whether the current runtime exposes
  `ctx.newSession()` before recommending fresh-session defaults
- add a dedicated check or doctor surface if needed, for example
  `/otto-check` or an onboarding validation step

Desired outcomes:

- users learn about incompatibility during install or first run, not deep
  into a queue-drain session
- remediation steps are concrete: upgrade Pi, use a supported runtime, or
  run Otto in reduced-support compatibility mode if allowed
- onboarding output records whether the environment is full-support or
  compatibility-only

Primary follow-up issue:

- `td-fce68f` Design Otto install and onboarding checks for session reset support

### 4. Documentation And Troubleshooting

Goal: make environment requirements and failure modes obvious.

Documentation surfaces to update:

- package README prerequisites and installation guidance
- example extension README onboarding and runtime notes
- troubleshooting guidance for `newSession` unavailable,
  session-rotation-cancelled, and command-conflict cases
- packaging guidance that distinguishes supported `pi install` usage from
  ad hoc extension copying when runtime capability differs

Desired outcomes:

- Otto's minimum supported Pi/runtime expectation is explicit
- degraded mode is explained honestly and consistently
- troubleshooting points users to exact remediation steps

Primary follow-up issue:

- `td-87d0e8` Update Otto docs for session reset requirements and troubleshooting

## Support Tiers

| Tier               | Conditions                                                                              | Otto posture                                                           |
| ------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Full support       | Pi exposes `ctx.newSession()` to extension commands                                     | Fresh-session continuation enabled and documented as supported         |
| Compatibility mode | Fresh-session support missing, but operator explicitly allows same-session continuation | Otto warns, marks reduced guarantees, and avoids claiming full support |
| Unsupported        | Fresh-session support missing and full mode is required                                 | Otto fails fast with remediation guidance                              |

## Release Gate

Before calling Otto fully supported in constrained Pi environments, the
project should complete all of the following:

- runtime capability detection and explicit fail-fast behavior are shipped
- install or onboarding validation for session-reset support is shipped
- README and troubleshooting guidance are updated for package and local
  extension setups
- same-session fallback is documented as degraded, not equivalent

## Recommended Sequence

1. ship runtime detection and fail-fast behavior
2. ship onboarding or doctor checks
3. complete README and troubleshooting updates
4. then decide whether compatibility mode remains exposed by default
