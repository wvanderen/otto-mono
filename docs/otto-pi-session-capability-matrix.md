# Otto Pi Session Capability Matrix

This note audits what Otto can rely on from Pi for fresh-session and
context-reset behavior.

It is based on the current `pi-mono` extension and runtime APIs,
cross-checked with `btca ask -r pi` against the registered Pi codebase
resource.

## Bottom Line

- Otto full-mode support depends on Pi exposing `ctx.newSession()` to
  extension command handlers.
- Pi does not expose an extension-safe `clear-context` or
  `clear-messages` API that resets the current session in place.
- When `ctx.newSession()` is missing or fails, Otto can only fall back to
  same-session compaction, which weakens review-separation guarantees.

## Capability Matrix

| Pi runtime/build surface                                         | `ctx.newSession()` in extension commands | Extension-safe clear/reset-in-place API | Otto support level                | Notes                                                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------- | --------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Interactive Pi command runtime                                   | Yes                                      | No                                      | Full support                      | Best fit for Otto. Native fresh-session continuation matches Otto's review-separation model.                            |
| RPC mode command runtime                                         | Yes                                      | No                                      | Full support                      | Pi's RPC layer also supports `new_session`; command handlers still get `ctx.newSession()`.                              |
| Print/headless mode binding                                      | Yes, via command-context actions         | No                                      | Partial / not primary Otto target | The session API exists, but Otto's operator loop is designed for Pi command runtime behavior, not print-only execution. |
| Older or incompatible Pi builds where `ctx.newSession` is absent | No                                       | No                                      | Degraded only                     | Otto must fall back to same-session compaction and should not claim full-mode review separation.                        |

## Extension API Findings

### Supported fresh-session API

Pi exposes fresh-session rotation as `newSession()` on
`ExtensionCommandContext`, which is the context type passed to extension
command handlers registered with `pi.registerCommand(...)`.

That means Otto can safely depend on fresh-session rotation only from its
command-driven control loop, not from arbitrary extension lifecycle
hooks.

### Unsupported clear-context API

Pi does not expose an extension-safe API that clears the current
conversation while staying in the same session.

Related APIs exist, but they are not equivalent to a true in-place reset:

- `ctx.compact(...)` reduces prior context by summarizing it.
- session tree navigation and forking move or branch within session
  history.
- queue-clearing APIs clear pending steering or follow-up messages, not
  the session transcript itself.
- lower-level agent reset/message-clearing APIs are not the same as a
  supported extension command surface for Otto.

## Otto Guidance

Recommended minimum Pi/runtime requirement for Otto full-mode support:

- Pi build that exposes `ExtensionCommandContext.newSession()` for
  extension commands.

Operational interpretation:

- If `ctx.newSession()` is available, Otto can preserve fresh-session
  iteration and uphold `td` review separation as designed.
- If `ctx.newSession()` is unavailable, Otto should be treated as
  same-session degraded mode only, even if compaction fallback keeps the
  loop moving.
- Otto should not rely on any extension-level `clear-context` behavior,
  because Pi does not currently provide that contract.

## Recommended Product Positioning

- Document fresh-session continuation as a Pi capability requirement for
  Otto full mode.
- Document same-session compaction as a compatibility fallback, not a
  peer feature.
- Prefer feature detection (`typeof ctx.newSession === "function"`) over
  unsupported assumptions about clear/reset APIs.

## Evidence Snapshot

Confirmed via Pi codebase reference checks:

- `ExtensionCommandContext` includes `newSession(...)`.
- Interactive, RPC, and print mode bindings wire command-context
  `newSession` actions.
- Pi's RPC protocol includes `new_session`.
- No extension-safe `clear-context` equivalent is exposed alongside that
  API.
