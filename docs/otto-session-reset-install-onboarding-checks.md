# Otto Session Reset Install And Onboarding Checks

This note defines how Otto should validate session-reset support during
installation and onboarding, before a long autonomous run begins.

It builds on:

- `docs/otto-pi-session-capability-matrix.md`
- `docs/otto-session-reset-support-plan.md`
- `docs/otto-runtime-session-detection-design.md`

## Objective

Catch unsupported Pi environments early, explain what guarantee is
missing, and guide the operator toward either a supported full-mode setup
or an explicit compatibility decision.

## Validation Goals

- verify whether the current command context exposes `ctx.newSession()`
- surface the result before Otto starts a long loop
- record whether the operator wants `require-fresh` or
  `allow-compatibility`
- keep install-time guidance short and put the heavier explanation in
  onboarding and troubleshooting docs

## Validation Moments

### 1. Install-Time Guidance

Install docs should warn before the user ever runs Otto.

Required guidance:

- Otto full mode requires Pi support for `ctx.newSession()` in extension
  command handlers
- `pi install` is the supported installation path for package use
- local extension copying or symlinking does not add missing Pi runtime
  capability
- unsupported runtimes may still allow a compatibility mode, but only
  with reduced review-separation guarantees

Install docs should not attempt a true runtime check on their own.
Instead, they should point users to onboarding or doctor output for the
actual result.

### 2. Onboarding-Time Validation

Primary validation should happen in `/otto-onboard`.

Reasoning:

- onboarding already introduces Otto's operating model
- onboarding has the right project context to write `.pi/otto.json`
- onboarding is early enough to prevent a misleading first run

Recommended onboarding flow:

1. explain that Otto full mode depends on Pi fresh-session support
2. detect `typeof ctx.newSession === "function"`
3. classify the environment as `full-support` or `compatibility-only`
4. ask the operator to confirm the continuity policy when support is
   missing
5. write the result into project config and report the final posture

### 3. Start-Time Enforcement

`/otto-start` should enforce the policy chosen during onboarding or by
explicit flags.

Expected behavior:

- `require-fresh` + unsupported runtime -> stop immediately
- `allow-compatibility` + unsupported runtime -> warn and continue in
  degraded mode
- supported runtime -> continue normally and record full support

This keeps onboarding advisory and `/otto-start` authoritative.

## Recommended Config Surface

Store the user's policy decision explicitly.

Recommended fields:

- `defaults.freshSessionBetweenSteps`
- `defaults.sessionPolicy`

Recommended values:

- `require-fresh`
- `allow-compatibility`

If backward compatibility requires older flags, Otto should normalize them
into this policy model before reporting status.

## Onboarding Output

Onboarding should report both capability and policy.

Recommended summary shape:

- `Session support: full` or `Session support: compatibility-only`
- `Continuity policy: require fresh session` or
  `Continuity policy: allow compatibility mode`
- `Next step: start Otto normally` or a remediation instruction

Recommended config note:

- tell the operator where the decision was saved in `.pi/otto.json`

## Dedicated Doctor Command Recommendation

Recommendation: add a dedicated `/otto-check` command, but treat it as a
follow-on convenience surface rather than the primary first-run check.

Why it is worth adding:

- it gives operators a cheap, repeatable diagnostic after Pi upgrades or
  environment changes
- it keeps support and troubleshooting workflows lightweight
- it can report capability, policy, config, and remediation in one place

Why onboarding should still come first:

- onboarding already exists and is part of the happy path
- a dedicated doctor command should not become required just to get a
  safe first run

Recommended `/otto-check` outputs:

- detected session capability
- configured session policy
- whether current config and runtime are compatible
- remediation steps if not

## Remediation Matrix

| Situation                                          | Otto posture         | Remediation                                                |
| -------------------------------------------------- | -------------------- | ---------------------------------------------------------- |
| `ctx.newSession()` available                       | Full support         | Continue with fresh-session defaults                       |
| `ctx.newSession()` missing, compatibility allowed  | Degraded but allowed | Continue only if reduced guarantees are acceptable         |
| `ctx.newSession()` missing, fresh session required | Unsupported          | Upgrade Pi or change policy explicitly                     |
| Session rotation later fails unexpectedly          | Pause or fail        | Re-run checks, inspect runtime, and avoid silent downgrade |

## Message Design

Use short, direct wording.

Recommended unsupported-runtime message:

- `Otto full mode requires Pi fresh-session support, but this runtime does not expose ctx.newSession() to extension commands.`

Recommended remediation list:

- upgrade Pi to a build that exposes `ctx.newSession()`
- run Otto in a supported Pi command runtime
- explicitly allow compatibility mode only if reduced guarantees are acceptable

Recommended compatibility warning:

- `Otto is continuing in same-session compatibility mode. Review-separation and context-boundary guarantees are reduced.`

## Implementation Outline

1. add a shared helper that classifies session capability from the command
   context
2. call it during `/otto-onboard`
3. store the policy decision in config
4. add `/otto-start` enforcement against stored or CLI-selected policy
5. add `/otto-check` as a follow-on diagnostic command
6. align docs and troubleshooting language with the same policy model

## Non-Goals

- inferring support from Pi internals instead of the public
  `ctx.newSession()` contract
- silently rewriting the user's policy to keep Otto running
- treating same-session compaction as equivalent to fresh-session support
