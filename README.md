# BMAD TD Monorepo

This monorepo ships two public packages for teams building with BMAD,
`td`, and Pi:

- `@wvanderen/bmad-module-td`: the BMAD module that connects
  planning artifacts to `td` execution state
- `@wvanderen/otto`: Otto, a Pi-native operating layer for running
  BMAD + `td` loops with stronger judgment and tighter context

## Why This Repo Exists

The core idea is simple: `td` is state, BMAD is structure.

- BMAD `.md` files hold planning artifacts such as PRDs,
  architecture, epics, and stories
- `td` issues hold execution state such as status, dependencies, handoffs, and reviews
- sidecar provides observability around the loop

Together, the module and Otto turn BMAD planning into a more
operational delivery system instead of a pile of disconnected prompts.

## Packages

### `@wvanderen/bmad-module-td`

The td-integration module adds a focused command set for connecting
BMAD artifacts to `td` workflows.

Install from npm:

```bash
npm install @wvanderen/bmad-module-td
```

Install into a BMAD workspace from this repo:

```bash
npx bmad-method install --custom-content /path/to/repo/packages/bmad-module-td \
  --action update --yes
```

`--custom-content` is currently required because this is a community
module rather than an official registry package.

Requirements:

- `td` CLI installed and initialized
- a Git repository
- BMAD core planning artifacts from the BMM module

Commands:

- `/bmad:td:initialize`: accept-default onboarding for greenfield or
  brownfield projects; sets up BMAD artifacts and `td` dependency
  mapping
- `/bmad:td:setup-validation`: configures project-specific validation
  methodology and quality gates
- `/bmad:td:next-step`: analyzes workspace state and performs the
  highest-priority delivery action
- `/bmad:td:validate-prd`: validates delivered work against the PRD,
  creates `td` gap tasks, and reports residual risk

`/bmad:td:next-step` uses a strict priority order:

1. reviews
2. ready implementation work
3. epic maintenance workflows
4. PRD validation when execution work is otherwise drained

Validation is a first-class gate, not a cleanup step:

- `/bmad:td:setup-validation` creates and maintains the project
  validation config
- agents are expected to verify beyond tests where appropriate: lint,
  typecheck, build, smoke, security, and visual checks
- if the validation config is missing, fallback checks run and confidence is downgraded

Approval-grade evidence stays machine-checkable and should include
changed files, gate results, artifact references, confidence, risks,
and follow-up issues. UI work should carry real visual evidence; CLI
and TUI work should carry real command evidence.

### `@wvanderen/otto`

Otto is the Pi-native operating layer in this repo. It is built for
developer AI power users who already work fluently inside coding agents
and want the next real jump in velocity without giving up review
discipline or runtime truth.

Install Otto in Pi:

```bash
pi install npm:@wvanderen/otto
```

Local package testing:

```bash
pi install ./packages/otto
```

Otto is optimized for:

- strong next-step judgment instead of generic long-context wandering
- fresh-session execution loops that keep context sharp
- review and approval discipline that respects `td` session separation
- runtime evidence over artifact-only completion signals
- queue drain that can reopen PRD gaps as actionable `td` work

Current Otto capabilities include:

- an automation loop around `/bmad:td:initialize`, `/bmad:td:next-step`, and `/bmad:td:validate-prd`
- `/otto-onboard` for writing project Otto preferences
- workflow wrappers for BMAD planning, delivery, and review flows
- run monitoring, failure budgets, checkpoints, and persisted loop state
- fresh-session continuation with dive and fork tooling
- layered config from `.otto.json`, `.pi/otto.json`, legacy autopilot
  files, and `OTTO_CONFIG` or `BMAD_AUTOPILOT_CONFIG`
- formalized `delivery`, `explore`, and `custom` autonomy modes plus
  workflow-specific steering such as `party`
- a packaged `otto` skill resource for Pi agents

For more detail, see `packages/otto/README.md`.

## Commit And Review Standards

- create the git commit before `td review`
- use lowercase conventional commit types: `feat`, `fix`, `refactor`,
  `docs`, `test`, or `chore`
- keep the subject imperative, lowercase after the colon, and free of
  trailing punctuation
- keep commit body order stable: `Task`, `Story`, `td`,
  implementation bullets, `Tests`, `Refs`

Example:

```text
feat(story-X.Y): brief description

Task: {task description}
Story: {story_key}
td: {td_issue_id}

- Implementation details

Tests:
- Test summary

Refs: {td_issue_id}
```

## Development

Workspace layout:

- `packages/bmad-module-td`: publishable BMAD td-integration module
- `packages/otto`: publishable Pi package and Otto runtime source of truth
- `examples/pi-extension`: local Pi extension fixture for docs and experimentation

Operational details live in `docs/monorepo-ops.md`.

Common commands:

```bash
# Sync module source into the installable _bmad mirror
npm run sync:module

# Check mirror drift
npm run sync:check

# Lint and format checks
npm run lint
npm run format:check

# Full repo verification
npm test
```

## Publishing

```bash
# Validate both workspace packages before release or CI
npm run release:check

# Module release and publish
npm run release:module:patch
npm run publish:module

# Otto release and publish
npm run release:otto:patch
npm run publish:otto
```

## Strategy Docs

- `docs/otto-manifesto.md`
- `docs/otto-dna-roadmap.md`
- `docs/otto-roadmap-4-8-weeks.md`

## License

MIT License - see `LICENSE` for details.

Part of the [BMad Method](https://github.com/bmad-code-org) ecosystem.
