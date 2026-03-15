<!-- markdownlint-disable MD033 MD041 -->
<div align="center">
  <pre>██████╗ ████████╗████████╗ ██████╗
██╔═══██╗╚══██╔══╝╚══██╔══╝██╔═══██╗
██║   ██║   ██║      ██║   ██║   ██║
██║   ██║   ██║      ██║   ██║   ██║
╚██████╔╝   ██║      ██║   ╚██████╔╝
 ╚═════╝    ╚═╝      ╚═╝    ╚═════╝</pre>
</div>
<!-- markdownlint-enable MD033 MD041 -->

Otto is a Pi-native operating layer for running BMAD + `td` delivery
loops with less babysitting and better judgment.

BMAD gives AI-assisted development structured planning. `td` gives it
durable execution state, dependencies, handoffs, and review flow. Otto
synthesizes them into a closed loop that makes longer autonomous runs
practical in the first place, then pushes that loop toward stronger
judgment, cleaner review discipline, and more trustworthy delivery.

## Why Use Otto

BMAD and `td` are powerful, but repeated agent-driven execution still
breaks down in familiar ways:

- the next step is not always chosen well
- context gets blurry across long runs
- workflow completion can get mistaken for product completion
- review discipline weakens when the loop gets fast

Otto exists to close that gap.

What Otto does:

- drives `/bmad:td:initialize`, `/bmad:td:next-step`, and
  `/bmad:td:validate-prd` as a real operating loop
- keeps execution centered on current `td` state instead of loose chat
  history
- preserves `td` review separation through fresh-session continuation
- treats runtime evidence and PRD validation as part of delivery, not
  an afterthought
- reopens gaps as actionable `td` work instead of silently declaring
  success

Otto is built for developer AI power users who want a meaningful jump
in delivery velocity without giving up traceability or product truth.

## Prerequisites

Otto is built on top of:

- [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) for creating rich PRDs,
  architecture, epics, and stories
- [`td`](https://github.com/marcus/td) for issue state, dependencies,
  handoffs, and review flow
- Pi as the runtime that hosts the Otto package and skill resources

Otto full mode also expects a Pi build that exposes native
`newSession()` support to extension command handlers. When that API is
missing, Otto falls back to same-session compaction and cannot preserve
its strongest review-separation guarantees.

Otto is also being refactored toward a hybrid-core architecture where the
run engine owns session lifecycle through the Pi SDK and Pi remains the
main operator surface. The current extension-first implementation is
transitional; see `docs/otto-hybrid-core-blueprint.md`.

## Installation

Install from npm into Pi:

```bash
pi install npm:@wvanderen/otto
```

Install from a local checkout while developing:

```bash
pi install ./packages/otto
```

Otto is a Pi package, so the primary install path is `pi install`, not `npm install`.

## Quick Start

1. Install Otto into Pi
2. Open your BMAD + `td` project in Pi
3. Run `/otto-onboard` to write project preferences into `.pi/otto.json`
4. Start using Otto's workflow wrappers or run the loop directly

Common commands:

- `/otto-onboard`
- `/otto-start`
- `/otto-status`
- `/otto-pause`
- `/otto-resume`
- `/otto-stop`
- `/otto-dive`
- `/bmad:td:initialize`
- `/bmad:td:next-step`
- `/bmad:td:validate-prd`

## How Otto Works

Otto's core loop is:

1. prepare the workspace
2. execute the highest-value next step
3. preserve review separation and context sharpness
4. validate against the PRD and real runtime behavior
5. reopen gaps as actionable `td` work

This makes Otto feel less like a prompt bundle and more like an
operator for BMAD + `td` delivery.

## What Ships In This Package

- Pi extension entrypoint at `src/index.ts`
- Otto extension implementation in `src/otto.ts`
- packaged Pi skill resources in `skills/otto/`
- package metadata in `package.json` via the `pi.extensions` and
  `pi.skills` manifest fields

The published package is intentionally shaped to match Pi's package
model so public users can install it directly with `pi install`.

Architecture direction:

- near term: Pi package with extracted core/runtime boundaries
- target: SDK-driven Otto engine with a thin Pi adapter
- planning reference: `docs/otto-hybrid-core-blueprint.md`

## Configuration

Run `/otto-onboard` to save project-wide Otto preferences into `.pi/otto.json`.

Otto reads optional JSON preferences in increasing precedence:

- `.otto.json`
- `.pi/otto.json`
- `.bmad-autopilot.json`
- `.pi/bmad-autopilot.json`
- `OTTO_CONFIG`
- `BMAD_AUTOPILOT_CONFIG`

Key config surfaces:

- `autonomy.mode`: `delivery`, `explore`, or `custom`
- `autonomy.policies.approval`: `strict`, `balanced`, or `draft`
- `autonomy.policies.drift`: `validate`, `continue`, or `pause`
- `autonomy.policies.evidence`: `strict`, `balanced`, or `relaxed`
- `autonomy.policies.steering`: `steady` or `interactive`
- `workflows.commandModes`: opt selected workflows into
  higher-steering modes such as `party`

Recommended defaults:

- `delivery`: strict approval, validate on drift, strict evidence, steady steering
- `explore`: draft approval, continue on drift, relaxed evidence, interactive steering
- `custom`: delivery-shaped baseline with explicit overrides

Use `workflows.commandModes` to opt specific workflows into `party` mode, for example:

- `/bmad:bmm:create-architecture`
- `/bmad:td:validate-prd`

This supports mixed autonomy rather than one fixed control philosophy.

## Packaging Model

Current source of truth:

- `packages/otto/src/otto.ts`
- `packages/otto/src/otto-result.mjs`
- `packages/otto/skills/otto/SKILL.md`

Before `npm pack` or `npm publish`, the package sync step copies that source into:

- `examples/pi-extension/otto.ts`
- `examples/pi-extension/otto-result.mjs`
- `examples/pi-extension/skills/otto/SKILL.md`
- `.pi/extensions/otto.ts`
- `.pi/extensions/otto-result.mjs`

That keeps the package as the implementation source of truth while still
updating the local prototype and project-local Pi extension copies.

This packaging model is temporary. The approved direction is to move Otto
toward a package-first hybrid core so the remaining prototype sync layer
can eventually disappear entirely.

## Roadmap

Otto is still early. The roadmap is intentionally high level and tracks
what matters most for real-world use.

### Done Or In Place

- ✅ automated loop around initialize, next-step, and validate-prd
- ✅ onboarding and layered project config
- ✅ fresh-session continuation, checkpoints, and dive tooling
- ✅ autonomy modes with workflow-specific steering
- ✅ PRD gap reopening and `td` drift detection

### In Progress

- 🚧 stronger control-plane reliability and clearer run-state signaling
- 🚧 better operator visibility into current `td`, why, and confidence
- 🚧 stronger runtime evidence handling and review quality
- 🚧 cleaner packaging and public-facing productization

### Next Up

- ⏳ better false-completion detection against the real product core
- ⏳ simpler first-run experience for external Pi users
- ⏳ sharper defaults for exploratory versus serious delivery work

Working docs:

- `docs/otto-manifesto.md`
- `docs/otto-dna-roadmap.md`
- `docs/otto-roadmap-4-8-weeks.md`
- `docs/otto-evaluation-scorecard.md`
- `docs/otto-pi-session-capability-matrix.md`
- `docs/otto-session-reset-support-plan.md`
- `docs/otto-runtime-session-detection-design.md`
- `docs/otto-session-reset-docs-plan.md`
- `docs/otto-session-reset-install-onboarding-checks.md`
- `docs/otto-hybrid-core-blueprint.md`

If you want the fuller product direction behind this roadmap, start
with `docs/otto-manifesto.md`.

## Security And Trust Model

Otto is designed for serious delivery work, so users should expect it to:

- inspect and act on local repository state
- run project commands needed for validation
- create or update local config files such as `.pi/otto.json`
- make workflow decisions based on BMAD artifacts, `td` state, and runtime evidence

That is the point of the package, but it also means you should review
the source, understand your autonomy settings, and choose the right
evidence policy for the project.

## Publishing

```bash
# Validate the package tarball before publishing
npm run publish:check

# Patch release
npm run release

# Minor release
npm run release:minor

# Major release
npm run release:major

# Publish package
npm run publish:package
```
