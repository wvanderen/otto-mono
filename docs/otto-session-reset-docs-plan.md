# Otto Session Reset Docs Plan

This note scopes the documentation work needed to make Otto's
session-reset requirements explicit and consistent across package,
extension, onboarding, and troubleshooting surfaces.

It builds on:

- `docs/otto-pi-session-capability-matrix.md`
- `docs/otto-session-reset-support-plan.md`
- `docs/otto-runtime-session-detection-design.md`

## Objective

Make it obvious that Otto full mode depends on Pi fresh-session support,
that same-session continuation is only a degraded compatibility path,
and that operators have concrete remediation steps when the runtime does
not meet that requirement.

## Problems To Fix

Current docs mention `newSession()` requirements in a few places, but the
guidance is still fragmented.

The main gaps are:

- prerequisites are not yet described with one canonical support policy
- local extension and packaged install guidance are not clearly separated
- troubleshooting content is not centralized around the planned stop codes
- current fallback wording can read like same-session compaction is a peer
  mode instead of reduced support

## Documentation Principles

- describe `ctx.newSession()` as the Otto full-mode requirement
- describe same-session continuation as compatibility mode, not an equal
  substitute
- keep package-install guidance and single-source-of-truth local extension
  guidance distinct
- use the same terms as runtime state and stop-code design
- make remediation steps concrete and short

## Documentation Surfaces

### 1. Package README

Primary file:

- `packages/otto/README.md`

Required updates:

- add a concise support-policy block in prerequisites
- clarify that `pi install` is the supported install path for packaged use
- explain that Otto full mode requires Pi command-context access to
  `ctx.newSession()`
- add a short compatibility-mode note that reduced guarantees are
  intentional and explicit
- link to deeper troubleshooting and runtime-design docs

Recommended content:

- supported environment summary
- unsupported environment summary
- one remediation list: upgrade Pi, use supported runtime, or opt into
  explicit compatibility mode if acceptable

### 2. Local Extension README

Primary file:

- `examples/pi-extension/README.md`

Required updates:

- explain that this path is for prototype or single-source-of-truth local
  iteration, not the primary packaged install story
- document the same support tiers used in the package README
- explain how local-copy or symlink installs can diverge from packaged Pi
  behavior if users mix files manually
- add troubleshooting notes for `/reload`, stale local files, and runtime
  mismatch between local extension code and Pi capabilities

Recommended content:

- "when to use this setup" guidance
- "when to prefer `pi install ./packages/otto`" guidance
- note that local extension copying does not change Pi runtime capability

### 3. Troubleshooting Doc

Primary file to add:

- `docs/otto-session-reset-troubleshooting.md`

Purpose:

- give one stable place for failure modes, symptoms, stop reasons, and
  remediation steps

Scenarios to cover:

- `ctx.newSession()` unavailable at startup
- session rotation cancelled by operator or extension flow
- session rotation fails unexpectedly after capability was detected
- command conflict or command-context mismatch prevents expected session
  rotation behavior
- operator intentionally enables compatibility mode and needs to
  understand reduced guarantees

Recommended per-scenario structure:

- symptom
- likely cause
- how Otto reports it
- remediation

### 4. Onboarding Surfaces

Primary surfaces:

- `/otto-onboard` output and prompts
- `.pi/otto.json` guidance in `packages/otto/README.md`
- follow-on install/onboarding design in `docs/otto-session-reset-install-onboarding-checks.md`

Required updates:

- describe the support check during onboarding
- explain what configuration means "require fresh session" versus
  "allow compatibility"
- show where onboarding records the resulting support tier

### 5. Working-Docs Index

Primary file:

- `packages/otto/README.md`

Required updates:

- keep all session-reset design docs listed together so future doc work
  has an obvious chain of references

## Source-Of-Truth Setup Guidance

The docs should explicitly separate these setup stories:

### Packaged install

Supported public path:

- `pi install npm:@wvanderen/otto`
- `pi install ./packages/otto`

Documentation posture:

- primary path for users
- support policy statements should assume this path first
- troubleshooting should treat this as the default expectation

### Single-source-of-truth local extension setup

Prototype or contributor path:

- `examples/pi-extension/otto.ts`
- `examples/pi-extension/skills/otto/SKILL.md`

Documentation posture:

- valid for development and local iteration
- must not imply that copying files can bypass Pi runtime requirements
- should warn that stale copied files and mixed sources are separate from
  Pi session-reset capability itself

## Message Inventory

Docs should align with the runtime wording already planned.

Key messages to reuse consistently:

- full support: fresh-session available
- compatibility mode: same-session continuation with reduced
  review-separation guarantees
- unsupported runtime: fresh-session required, unavailable in current Pi
  runtime
- cancelled rotation: session switch was cancelled, Otto paused without
  silently downgrading
- rotation failure: fresh-session support existed, but the runtime failed
  during rotation

## Proposed Deliverables

1. update `packages/otto/README.md` prerequisites, installation notes, and
   working-doc links
2. update `examples/pi-extension/README.md` with clearer local-setup and
   troubleshooting guidance
3. add `docs/otto-session-reset-troubleshooting.md`
4. ensure onboarding docs point to the same support tiers and remediation
   language

## Suggested Sequence

1. land install/onboarding validation design
2. add troubleshooting doc with stop-code-driven guidance
3. tighten package README language
4. tighten local extension README language
5. do a consistency pass across all Otto docs for support-tier wording
