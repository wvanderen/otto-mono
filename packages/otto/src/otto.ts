import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { promisify } from "node:util";

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import {
  appendOttoCheckpoint,
  applyFailureState,
  applyInitCompletion,
  applyAgentResultUpdate,
  applyQueuedWorkflow,
  applyStopState,
  advanceOttoIteration,
  buildFailureBudgetReason,
  buildOttoTdDriftReason,
  buildStopNotification,
  completeAwaitingWorkflowStart,
  createOttoCoreState,
  createWorkflowToken,
  initializeOttoRunState,
  markAwaitingWorkflowStarted,
  markOttoTdDrift,
  mergeOttoEvidenceSignals,
  pauseOttoRunState,
  parseOttoRemainingWork,
  resetOttoQueueProgress,
  resolveOttoQueueDrainDecision,
  resolveOttoQueueStateFromWork,
  resolveOttoSessionPolicy,
  resolveOttoTdDriftAction,
  resumeNextStepReason,
  updateOttoQueueState,
  registerOttoToolError,
  shouldIgnoreAgentEnd,
  startOttoTurn,
  type OttoActionKind,
  type OttoCheckpoint,
  type OttoConfidenceKind,
  type OttoContinuityKind,
  type OttoDriftPolicy,
  type OttoCoreState,
  type OttoOperatingMode,
  type OttoOutcomeKind,
  type OttoPhase,
  type OttoQueueState,
  type OttoResultSourceKind,
  type OttoRuntimeInspection,
  type OttoSessionHandle,
  type OttoSessionInfo,
  type OttoStopCode,
  type OttoWorkflowMode,
} from "./core";
import {
  OttoPiRuntimeController,
  PiCommandExecutor,
  PiOperatorUi,
  createCachedOttoPiServices,
} from "./pi-adapter";

import {
  classifyAction,
  classifyOutcome,
  inspectEvidence,
  parseIssueId,
  parseIssueTitle,
  resolveWorkflowResult,
  RESULT_PREFIX,
  shortText,
} from "./otto-result.mjs";

const INIT_COMMAND = "/bmad:td:initialize";
const NEXT_STEP_COMMAND = "/bmad:td:next-step";
const VALIDATE_PRD_COMMAND = "/bmad:td:validate-prd";
const CONTINUE_COMMAND = "/otto-continue";
const STATE_ENTRY_TYPE = "otto-state";
type WorkflowCommand =
  | "/bmad:td:initialize"
  | "/bmad:td:next-step"
  | "/bmad:td:validate-prd"
  | "/bmad:bmm:create-architecture"
  | "/bmad:bmm:create-epics-and-stories"
  | "/bmad:bmm:create-story"
  | "/bmad:bmm:code-review";

type WorkflowMode = OttoWorkflowMode;
type OperatingMode = OttoOperatingMode;
type ApprovalPolicy = "strict" | "balanced" | "draft";
type DriftPolicy = OttoDriftPolicy;
type EvidencePolicy = "strict" | "balanced" | "relaxed";
type SteeringPolicy = "steady" | "interactive";
type ActionKind = OttoActionKind;
type OutcomeKind = OttoOutcomeKind;
type ConfidenceKind = OttoConfidenceKind;
type ContinuityKind = OttoContinuityKind;
type ResultSourceKind = OttoResultSourceKind;

interface AutopilotPreferences {
  defaults?: {
    skipInit?: boolean;
    maxIterations?: number;
    maxFailures?: number;
    freshSessionBetweenSteps?: boolean;
  };
  autonomy?: {
    mode?: OperatingMode;
    policies?: {
      approval?: ApprovalPolicy;
      drift?: DriftPolicy;
      evidence?: EvidencePolicy;
      steering?: SteeringPolicy;
    };
  };
  workflows?: {
    defaultMode?: WorkflowMode;
    commandModes?: Partial<Record<WorkflowCommand, WorkflowMode>>;
  };
}

interface ResolvedAutonomy {
  mode: OperatingMode;
  approval: ApprovalPolicy;
  drift: DriftPolicy;
  evidence: EvidencePolicy;
  steering: SteeringPolicy;
}

interface LoadedPreferences {
  preferences: AutopilotPreferences;
  source: string | null;
  error: string | null;
}

const CONFIG_PATHS = [
  ".otto.json",
  ".pi/otto.json",
  ".bmad-autopilot.json",
  ".pi/bmad-autopilot.json",
];
const PROJECT_PREFERENCES_PATH = ".pi/otto.json";
const PREFERENCE_ONBOARDING_HINT =
  "Otto is using built-in defaults. Run /otto-onboard to save project preferences.";
const ONBOARDING_MARKER_ENTRY_TYPE = "otto-onboarding-hint";
const ONBOARDING_MARKER_VERSION = 1;
const execFileAsync = promisify(execFile);
const tdIssueTitleCache = new Map<string, string | null>();
const tdIssueTitleRequests = new Map<string, Promise<string | null>>();

type PreferenceChoice<T> = {
  label: string;
  value: T;
};

type WorkflowPreferenceOverride = WorkflowMode | "inherit";
type PolicyOverride<T extends string> = T | "inherit";

interface PreferenceCandidate {
  label: string;
  path: string;
}

type Phase = OttoPhase;
type StopCode = OttoStopCode;
type QueueState = OttoQueueState;
type Checkpoint = OttoCheckpoint;
type RunState = OttoCoreState;

const newRunState = (): RunState => createOttoCoreState();

const newWorkflowToken = (): string => createWorkflowToken();

const MODE_DEFAULTS: Record<
  Exclude<OperatingMode, "custom">,
  AutopilotPreferences
> = {
  delivery: {
    defaults: {
      skipInit: false,
      maxIterations: 25,
      maxFailures: 3,
      freshSessionBetweenSteps: true,
    },
    autonomy: {
      mode: "delivery",
      policies: {
        approval: "strict",
        drift: "validate",
        evidence: "strict",
        steering: "steady",
      },
    },
    workflows: {
      defaultMode: "accept-default",
      commandModes: {
        "/bmad:bmm:create-architecture": "party",
        "/bmad:bmm:create-epics-and-stories": "party",
        "/bmad:td:validate-prd": "party",
      },
    },
  },
  explore: {
    defaults: {
      skipInit: true,
      maxIterations: 15,
      maxFailures: 5,
      freshSessionBetweenSteps: false,
    },
    autonomy: {
      mode: "explore",
      policies: {
        approval: "draft",
        drift: "continue",
        evidence: "relaxed",
        steering: "interactive",
      },
    },
    workflows: {
      defaultMode: "party",
      commandModes: {
        "/bmad:td:validate-prd": "party",
      },
    },
  },
};

const policySummary = (autonomy: ResolvedAutonomy): string =>
  `approval=${autonomy.approval}, drift=${autonomy.drift}, evidence=${autonomy.evidence}, steering=${autonomy.steering}`;

const resolveAutonomy = (
  preferences: AutopilotPreferences,
): ResolvedAutonomy => {
  const mode = preferences.autonomy?.mode ?? "delivery";
  const policyDefaults =
    mode === "explore"
      ? MODE_DEFAULTS.explore.autonomy?.policies
      : MODE_DEFAULTS.delivery.autonomy?.policies;

  return {
    mode,
    approval:
      preferences.autonomy?.policies?.approval ??
      policyDefaults?.approval ??
      "strict",
    drift:
      preferences.autonomy?.policies?.drift ??
      policyDefaults?.drift ??
      "validate",
    evidence:
      preferences.autonomy?.policies?.evidence ??
      policyDefaults?.evidence ??
      "strict",
    steering:
      preferences.autonomy?.policies?.steering ??
      policyDefaults?.steering ??
      "steady",
  };
};

const checkpointLabel = (checkpoint: Checkpoint): string => {
  const checkpointIssue = currentIssueLabel(
    checkpoint.issueId,
    checkpoint.issueTitle,
  );
  const parts = [
    `#${checkpoint.iteration}`,
    new Date(checkpoint.timestamp).toLocaleTimeString(),
    checkpointIssue !== "-" ? checkpointIssue : checkpoint.command,
    checkpoint.action ?? checkpoint.command,
    checkpoint.confidence,
  ];

  if (checkpoint.outcome) parts.push(checkpoint.outcome);
  if (checkpoint.continuity !== "none") {
    parts.push(checkpoint.continuity.replaceAll("-", " "));
  }
  if (checkpoint.alert) parts.push(checkpoint.alert);
  return shortText(`${parts.join(" | ")} | ${checkpoint.summary}`, 140);
};

const continuityLabel = (
  continuity: ContinuityKind,
  reason: string | null,
): string => {
  const base =
    continuity === "fresh-session"
      ? "fresh session"
      : continuity === "same-session-compacted"
        ? "same session (compacted)"
        : continuity === "compaction-fallback"
          ? "fallback after compaction failure"
          : "none";

  return reason ? `${base} - ${reason}` : base;
};

const currentIssueLabel = (
  issueId: string | null,
  issueTitle: string | null,
  maxLength = 80,
): string => {
  if (!issueId) return "-";
  return issueTitle
    ? shortText(`${issueId} - ${issueTitle}`, maxLength)
    : issueId;
};

const statusLabel = (state: RunState, alert: string | null): string => {
  if (!state.active) return `Otto: ${state.phase}`;

  const segments = [
    currentIssueLabel(state.lastIssueId, state.lastIssueTitle, 34),
    state.lastAction ?? state.phase,
    state.lastConfidence,
  ];

  if (alert) segments.push(shortText(alert, 18));
  return shortText(`Otto: ${segments.join(" | ")}`, 60);
};

const MAX_OTTO_WIDGET_LINES = 10;

const widgetReasonLabel = (reason: string | null): string =>
  reason ? shortText(reason, 96) : "-";

const buildWidgetLines = (
  state: RunState,
  issueId: string | null,
  issueTitle: string | null,
  alert: string | null,
): string[] => {
  const lines = [
    `Status: ${state.phase} | ${state.lastAction ?? "-"} | ${state.lastConfidence}`,
    `Run: ${state.runId ?? "none"}`,
    `Current td: ${issueId ?? "-"}`,
    `Why: ${widgetReasonLabel(state.lastDecisionReason)}`,
  ];

  if (issueTitle) lines.splice(3, 0, `td name: ${shortText(issueTitle, 96)}`);

  if (alert) lines.push(`Alert: ${shortText(alert, 96)}`);
  if (state.stopReason)
    lines.push(`Reason: ${shortText(state.stopReason, 96)}`);

  lines.push(
    `Iteration: ${state.iteration}/${state.maxIterations} | Failures: ${state.failures}/${state.maxFailures}`,
    `Continuity: ${continuityLabel(state.lastContinuation, state.lastContinuationReason)}`,
  );

  if (state.lastEvidenceSignals.length > 0) {
    lines.push(
      `Evidence: ${shortText(state.lastEvidenceSignals.join(", "), 96)}`,
    );
  }

  lines.push(
    `Outcome: ${state.lastOutcome ?? "-"} | Result: ${state.lastResultSource ?? "-"}`,
    `Queue: ${state.queueState} | Stop: ${state.stopCode} | Drain: ${state.emptyQueuePasses}`,
    `Mode: ${state.lastAutonomyMode} | Workflow: ${state.lastCommandMode}`,
    `Policies: ${shortText(state.lastPolicySummary, 96)}`,
    `Command: ${shortText(state.lastCommand ?? "-", 96)}`,
    `Session hop: ${state.freshSessionBetweenSteps ? "on" : "off"}`,
  );

  return lines.slice(0, MAX_OTTO_WIDGET_LINES);
};

const checkpointContextLabel = (checkpoint: Checkpoint): string => {
  const issue = currentIssueLabel(
    checkpoint.issueId,
    checkpoint.issueTitle,
    42,
  );
  return issue !== "-" ? issue : shortText(checkpoint.command, 42);
};

const stateAlert = (runState: RunState): string | null => {
  if (runState.lastEvidenceAlert) {
    return runState.lastEvidenceAlert;
  }

  if (runState.lastContinuation === "compaction-fallback") {
    return "continuity fallback";
  }

  if (
    runState.lastResultSource === "malformed" ||
    runState.lastResultSource === "mismatched"
  ) {
    return "result drift";
  }

  if (runState.lastConfidence === "low") {
    return "weak evidence";
  }

  if (runState.failures > 0) {
    return `recovered failures ${runState.failures}/${runState.maxFailures}`;
  }

  return null;
};

const sessionSupportAlert = (runState: RunState): string | null => {
  if (runState.sessionSupport === "unavailable") {
    return "current Pi session is outside Otto-managed session storage";
  }

  if (runState.sessionSupport === "failed") {
    return runState.lastError
      ? shortText(runState.lastError, 96)
      : "session runtime inspection failed";
  }

  return null;
};

const parseTdIssueTitle = (stdout: string): string | null => {
  try {
    const parsed = JSON.parse(stdout) as { title?: unknown };
    return typeof parsed.title === "string" && parsed.title.trim().length > 0
      ? shortText(parsed.title, 120)
      : null;
  } catch {
    return null;
  }
};

const getTdIssueTitle = async (issueId: string): Promise<string | null> => {
  if (tdIssueTitleCache.has(issueId)) {
    return tdIssueTitleCache.get(issueId) ?? null;
  }

  const inFlight = tdIssueTitleRequests.get(issueId);
  if (inFlight) return inFlight;

  const request = execFileAsync("td", ["show", issueId, "--json"], {
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  })
    .then(({ stdout }) => parseTdIssueTitle(stdout))
    .catch(() => null)
    .then((title) => {
      tdIssueTitleCache.set(issueId, title);
      tdIssueTitleRequests.delete(issueId);
      return title;
    });

  tdIssueTitleRequests.set(issueId, request);
  return request;
};

const checkpointActionOptions = (checkpoint: Checkpoint): string[] => {
  const context = checkpointContextLabel(checkpoint);
  const summary = shortText(checkpoint.summary, 56);
  return [
    `Navigate here | ${context} | ${summary}`,
    `Fork from here | ${context} | ${summary}`,
    `Show details | ${checkpoint.action ?? checkpoint.command} | ${checkpoint.confidence}`,
  ];
};

const shortPath = (value: string | null, cwd: string): string => {
  if (!value) return "-";
  const relativeValue = relative(cwd, value);
  if (
    relativeValue === "" ||
    (!relativeValue.startsWith("..") && !relativeValue.startsWith("../"))
  ) {
    return relativeValue || ".";
  }
  return value;
};

const formatSessionListLine = (
  session: OttoSessionInfo,
  cwd: string,
): string => {
  const parts = [
    session.runId ?? "unbound",
    shortPath(session.sessionPath, cwd),
    new Date(session.updatedAt).toLocaleString(),
  ];

  if (session.summary) parts.push(shortText(session.summary, 64));

  return parts.join(" | ");
};

const buildRuntimeInspection = (
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  metadataPath: string | null,
): OttoRuntimeInspection => {
  const commands = pi
    .getCommands()
    .map((command) => command.name)
    .sort((left, right) => left.localeCompare(right));
  const ottoCommands = commands.filter((command) =>
    command.startsWith("otto-"),
  );
  const sessionName =
    ctx.sessionManager.getSessionName?.() ?? pi.getSessionName();

  return {
    cwd: ctx.cwd,
    sessionFile: ctx.sessionManager.getSessionFile(),
    sessionId: ctx.sessionManager.getSessionId(),
    sessionName: sessionName ?? null,
    sessionMetadataPath: metadataPath,
    availableCommands: commands,
    availableOttoCommands: ottoCommands,
    activeTools: pi
      .getActiveTools()
      .sort((left, right) => left.localeCompare(right)),
  };
};

const extractAssistantText = (messages: unknown[]): string => {
  if (!Array.isArray(messages)) return "";
  const assistantMessages = messages.filter(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      "role" in message &&
      (message as { role?: string }).role === "assistant",
  ) as Array<{ content?: Array<{ type?: string; text?: string }> }>;

  const last = assistantMessages[assistantMessages.length - 1];
  if (!last || !Array.isArray(last.content)) return "";

  const lines = last.content
    .filter(
      (part) => part && part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text as string);

  return lines.join("\n").trim();
};

const parseStartArgs = (
  args: string,
): {
  skipInit?: boolean;
  maxIterations?: number;
  maxFailures?: number;
  sameSession?: boolean;
} => {
  const tokens = args
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const parsed: {
    skipInit?: boolean;
    maxIterations?: number;
    maxFailures?: number;
    sameSession?: boolean;
  } = {};

  for (const token of tokens) {
    if (token === "--skip-init") parsed.skipInit = true;
    if (token === "--same-session") parsed.sameSession = true;
    if (token.startsWith("--max-iterations=")) {
      const value = Number.parseInt(
        token.slice("--max-iterations=".length),
        10,
      );
      if (Number.isFinite(value) && value > 0) parsed.maxIterations = value;
    }
    if (token.startsWith("--max-failures=")) {
      const value = Number.parseInt(token.slice("--max-failures=".length), 10);
      if (Number.isFinite(value) && value > 0) parsed.maxFailures = value;
    }
  }

  return parsed;
};

const mergePreferences = (
  base: AutopilotPreferences,
  incoming: AutopilotPreferences,
): AutopilotPreferences => ({
  defaults: {
    ...(base.defaults ?? {}),
    ...(incoming.defaults ?? {}),
  },
  autonomy: {
    ...(base.autonomy ?? {}),
    ...(incoming.autonomy ?? {}),
    policies: {
      ...(base.autonomy?.policies ?? {}),
      ...(incoming.autonomy?.policies ?? {}),
    },
  },
  workflows: {
    ...(base.workflows ?? {}),
    ...(incoming.workflows ?? {}),
    commandModes: {
      ...(base.workflows?.commandModes ?? {}),
      ...(incoming.workflows?.commandModes ?? {}),
    },
  },
});

const normalizePreferences = (
  preferences: AutopilotPreferences,
): AutopilotPreferences => {
  const defaults = preferences.defaults ?? {};
  const autonomy = preferences.autonomy ?? {};
  const workflows = preferences.workflows ?? {};
  const normalizedMode =
    autonomy.mode === "delivery" ||
    autonomy.mode === "explore" ||
    autonomy.mode === "custom"
      ? autonomy.mode
      : undefined;
  const commandModes = Object.fromEntries(
    Object.entries(workflows.commandModes ?? {}).filter(
      ([, mode]) => mode === "accept-default" || mode === "party",
    ),
  ) as Partial<Record<WorkflowCommand, WorkflowMode>>;
  const policies = autonomy.policies ?? {};
  const normalizedPolicies = {
    approval:
      policies.approval === "strict" ||
      policies.approval === "balanced" ||
      policies.approval === "draft"
        ? policies.approval
        : undefined,
    drift:
      policies.drift === "validate" ||
      policies.drift === "continue" ||
      policies.drift === "pause"
        ? policies.drift
        : undefined,
    evidence:
      policies.evidence === "strict" ||
      policies.evidence === "balanced" ||
      policies.evidence === "relaxed"
        ? policies.evidence
        : undefined,
    steering:
      policies.steering === "steady" || policies.steering === "interactive"
        ? policies.steering
        : undefined,
  };

  const normalized: AutopilotPreferences = {};

  if (Object.keys(defaults).length > 0) {
    normalized.defaults = {
      ...(defaults.skipInit !== undefined
        ? { skipInit: defaults.skipInit }
        : {}),
      ...(defaults.maxIterations !== undefined
        ? { maxIterations: defaults.maxIterations }
        : {}),
      ...(defaults.maxFailures !== undefined
        ? { maxFailures: defaults.maxFailures }
        : {}),
      ...(defaults.freshSessionBetweenSteps !== undefined
        ? { freshSessionBetweenSteps: defaults.freshSessionBetweenSteps }
        : {}),
    };
  }

  if (
    normalizedMode !== undefined ||
    normalizedPolicies.approval !== undefined ||
    normalizedPolicies.drift !== undefined ||
    normalizedPolicies.evidence !== undefined ||
    normalizedPolicies.steering !== undefined
  ) {
    normalized.autonomy = {
      ...(normalizedMode !== undefined ? { mode: normalizedMode } : {}),
      ...(normalizedPolicies.approval !== undefined ||
      normalizedPolicies.drift !== undefined ||
      normalizedPolicies.evidence !== undefined ||
      normalizedPolicies.steering !== undefined
        ? {
            policies: {
              ...(normalizedPolicies.approval !== undefined
                ? { approval: normalizedPolicies.approval }
                : {}),
              ...(normalizedPolicies.drift !== undefined
                ? { drift: normalizedPolicies.drift }
                : {}),
              ...(normalizedPolicies.evidence !== undefined
                ? { evidence: normalizedPolicies.evidence }
                : {}),
              ...(normalizedPolicies.steering !== undefined
                ? { steering: normalizedPolicies.steering }
                : {}),
            },
          }
        : {}),
    };
  }

  if (
    workflows.defaultMode !== undefined ||
    Object.keys(commandModes).length > 0
  ) {
    normalized.workflows = {
      ...(workflows.defaultMode !== undefined
        ? { defaultMode: workflows.defaultMode }
        : {}),
      ...(Object.keys(commandModes).length > 0 ? { commandModes } : {}),
    };
  }

  return normalized;
};

const preferenceCandidates = (): PreferenceCandidate[] => {
  const cwd = process.cwd();
  const envPath =
    process.env.OTTO_CONFIG?.trim() ??
    process.env.BMAD_AUTOPILOT_CONFIG?.trim();

  return [
    ...CONFIG_PATHS.map((filePath) => ({
      label: filePath,
      path: resolve(cwd, filePath),
    })),
    ...(envPath
      ? [
          {
            label: process.env.OTTO_CONFIG?.trim()
              ? `OTTO_CONFIG (${envPath})`
              : `BMAD_AUTOPILOT_CONFIG (${envPath})`,
            path: resolve(envPath),
          },
        ]
      : []),
  ];
};

const displayPath = (filePath: string): string => {
  const rel = relative(process.cwd(), filePath);
  return rel && !rel.startsWith("..") ? rel : filePath;
};

const loadAutopilotPreferences = (): LoadedPreferences => {
  let preferences: AutopilotPreferences = {};
  let source: string | null = null;
  const warnings: string[] = [];

  for (const candidate of preferenceCandidates()) {
    if (!existsSync(candidate.path)) continue;
    try {
      const raw = readFileSync(candidate.path, "utf8");
      const parsed = JSON.parse(raw) as AutopilotPreferences;
      preferences = mergePreferences(
        preferences,
        parsed && typeof parsed === "object" ? parsed : {},
      );
      source = candidate.label;
    } catch (error) {
      warnings.push(
        `${candidate.label} could not be loaded (${error instanceof Error ? error.message : "Unknown preference parse error"})`,
      );
    }
  }

  return {
    preferences: normalizePreferences(preferences),
    source,
    error: warnings.length > 0 ? warnings.join("; ") : null,
  };
};

const saveAutopilotPreferences = (
  preferences: AutopilotPreferences,
): { path: string; preferences: AutopilotPreferences } => {
  const filePath = resolve(process.cwd(), PROJECT_PREFERENCES_PATH);
  mkdirSync(resolve(process.cwd(), ".pi"), { recursive: true });
  const normalized = normalizePreferences(preferences);
  writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return { path: filePath, preferences: normalized };
};

const onboardingChoice = async <T>(
  ctx: ExtensionCommandContext,
  title: string,
  choices: PreferenceChoice<T>[],
): Promise<T | null> => {
  return new PiOperatorUi(ctx).choose(title, choices);
};

const onboardingWorkflowOverride = async (
  ctx: ExtensionCommandContext,
  command: WorkflowCommand,
  title: string,
): Promise<WorkflowPreferenceOverride | null> =>
  onboardingChoice(ctx, title, [
    {
      label: `Inherit default | ${command}`,
      value: "inherit",
    },
    {
      label: `Accept default | ${command}`,
      value: "accept-default",
    },
    {
      label: `Party mode | ${command}`,
      value: "party",
    },
  ]);

const onboardingPolicyOverride = async <T extends string>(
  ctx: ExtensionCommandContext,
  title: string,
  inheritLabel: string,
  options: PreferenceChoice<T>[],
): Promise<PolicyOverride<T> | null> =>
  onboardingChoice<PolicyOverride<T>>(ctx, title, [
    {
      label: `Inherit mode default | ${inheritLabel}`,
      value: "inherit",
    },
    ...options,
  ]);

const onboardingSummary = (preferences: AutopilotPreferences): string[] => {
  const autonomy = resolveAutonomy(preferences);
  const overrides = Object.entries(preferences.workflows?.commandModes ?? {});
  return [
    `Operating mode: ${autonomy.mode}`,
    `Policies: ${policySummary(autonomy)}`,
    `Skip init: ${preferences.defaults?.skipInit ? "yes" : "no"}`,
    `Max iterations: ${preferences.defaults?.maxIterations ?? 25}`,
    `Max failures: ${preferences.defaults?.maxFailures ?? 3}`,
    `Fresh session between steps: ${preferences.defaults?.freshSessionBetweenSteps === false ? "no" : "yes"}`,
    `Default mode: ${preferences.workflows?.defaultMode ?? "accept-default"}`,
    `Overrides: ${overrides.length > 0 ? overrides.map(([command, mode]) => `${command}=${mode}`).join(", ") : "none"}`,
  ];
};

const runOnboarding = async (
  ctx: ExtensionCommandContext,
): Promise<{ path: string; preferences: AutopilotPreferences } | null> => {
  if (!ctx.hasUI) {
    ctx.ui.notify("/otto-onboard requires interactive mode.", "error");
    return null;
  }

  const current = loadAutopilotPreferences().preferences;
  const profile = await onboardingChoice(ctx, "Otto profile", [
    {
      label: "Delivery | strict approval, validate on drift",
      value: MODE_DEFAULTS.delivery,
    },
    {
      label: "Explore | interactive steering, lighter evidence gate",
      value: MODE_DEFAULTS.explore,
    },
    {
      label: "Custom | tune policies and workflow steering",
      value: {
        ...MODE_DEFAULTS.delivery,
        autonomy: {
          ...MODE_DEFAULTS.delivery.autonomy,
          mode: "custom" as OperatingMode,
        },
      },
    },
    {
      label: "Current config | start from what Otto loads now",
      value: current,
    },
  ]);
  if (!profile) return null;

  const profileMode = profile.autonomy?.mode ?? "delivery";

  const skipInit = await onboardingChoice(ctx, "Initialize before looping", [
    { label: "Run initialize first", value: false },
    { label: "Skip initialize", value: true },
  ]);
  if (skipInit === null) return null;

  const freshSessionBetweenSteps = await onboardingChoice(
    ctx,
    "Session continuity between next-step turns",
    [
      { label: "Fresh session between steps", value: true },
      { label: "Stay in same session", value: false },
    ],
  );
  if (freshSessionBetweenSteps === null) return null;

  const maxIterations = await onboardingChoice(ctx, "Max iterations per run", [
    { label: "10 iterations", value: 10 },
    { label: "25 iterations", value: 25 },
    { label: "40 iterations", value: 40 },
    { label: "60 iterations", value: 60 },
  ]);
  if (maxIterations === null) return null;

  const maxFailures = await onboardingChoice(
    ctx,
    "Max recovered failures before stopping",
    [
      { label: "2 failures", value: 2 },
      { label: "3 failures", value: 3 },
      { label: "5 failures", value: 5 },
    ],
  );
  if (maxFailures === null) return null;

  const defaultMode = await onboardingChoice(ctx, "Default workflow mode", [
    {
      label: "Accept default | Otto runs through",
      value: "accept-default" as WorkflowMode,
    },
    {
      label: "Party mode | Otto pauses at major transitions",
      value: "party" as WorkflowMode,
    },
  ]);
  if (!defaultMode) return null;

  const approvalPolicy = await onboardingPolicyOverride<ApprovalPolicy>(
    ctx,
    "Approval policy",
    profileMode,
    [
      {
        label: "Strict approval | require real target-surface evidence",
        value: "strict",
      },
      {
        label: "Balanced approval | allow partial evidence with callouts",
        value: "balanced",
      },
      {
        label: "Draft approval | exploratory proof is acceptable",
        value: "draft",
      },
    ],
  );
  if (!approvalPolicy) return null;

  const driftPolicy = await onboardingPolicyOverride<DriftPolicy>(
    ctx,
    "Drift handling",
    profileMode,
    [
      {
        label: "Validate on drift | route to validate-prd immediately",
        value: "validate",
      },
      {
        label: "Continue on drift | warn and keep moving",
        value: "continue",
      },
      {
        label: "Pause on drift | hand control back to operator",
        value: "pause",
      },
    ],
  );
  if (!driftPolicy) return null;

  const evidencePolicy = await onboardingPolicyOverride<EvidencePolicy>(
    ctx,
    "Evidence threshold",
    profileMode,
    [
      {
        label: "Strict evidence | validate any weak completion signal",
        value: "strict",
      },
      {
        label: "Balanced evidence | validate meaningful gaps",
        value: "balanced",
      },
      {
        label: "Relaxed evidence | reserve validation for severe drift",
        value: "relaxed",
      },
    ],
  );
  if (!evidencePolicy) return null;

  const steeringPolicy = await onboardingPolicyOverride<SteeringPolicy>(
    ctx,
    "Workflow steering",
    profileMode,
    [
      {
        label: "Steady steering | minimize pauses and prompts",
        value: "steady",
      },
      {
        label: "Interactive steering | surface pivots and tradeoffs early",
        value: "interactive",
      },
    ],
  );
  if (!steeringPolicy) return null;

  const architectureMode = await onboardingWorkflowOverride(
    ctx,
    "/bmad:bmm:create-architecture",
    "Create-architecture workflow mode",
  );
  if (!architectureMode) return null;

  const epicsMode = await onboardingWorkflowOverride(
    ctx,
    "/bmad:bmm:create-epics-and-stories",
    "Create-epics-and-stories workflow mode",
  );
  if (!epicsMode) return null;

  const validatePrdMode = await onboardingWorkflowOverride(
    ctx,
    "/bmad:td:validate-prd",
    "Validate-PRD workflow mode",
  );
  if (!validatePrdMode) return null;

  const preferences = normalizePreferences({
    ...profile,
    defaults: {
      ...(profile.defaults ?? {}),
      skipInit,
      maxIterations,
      maxFailures,
      freshSessionBetweenSteps,
    },
    autonomy: {
      ...(profile.autonomy ?? {}),
      mode: profileMode,
      policies: {
        ...((profile.autonomy?.policies ?? {}) as NonNullable<
          AutopilotPreferences["autonomy"]
        >["policies"]),
        ...(approvalPolicy !== "inherit" ? { approval: approvalPolicy } : {}),
        ...(driftPolicy !== "inherit" ? { drift: driftPolicy } : {}),
        ...(evidencePolicy !== "inherit" ? { evidence: evidencePolicy } : {}),
        ...(steeringPolicy !== "inherit" ? { steering: steeringPolicy } : {}),
      },
    },
    workflows: {
      ...(profile.workflows ?? {}),
      defaultMode,
      commandModes: {
        ...(architectureMode !== "inherit"
          ? { "/bmad:bmm:create-architecture": architectureMode }
          : {}),
        ...(epicsMode !== "inherit"
          ? { "/bmad:bmm:create-epics-and-stories": epicsMode }
          : {}),
        ...(validatePrdMode !== "inherit"
          ? { "/bmad:td:validate-prd": validatePrdMode }
          : {}),
      },
    },
  });

  const saved = saveAutopilotPreferences(preferences);
  ctx.ui.notify(
    [
      `Saved Otto preferences to ${displayPath(saved.path)}.`,
      ...onboardingSummary(saved.preferences),
    ].join("\n"),
    "success",
  );
  return saved;
};

const workflowModeFor = (
  command: WorkflowCommand,
  preferences: AutopilotPreferences,
): WorkflowMode =>
  preferences.workflows?.commandModes?.[command] ??
  preferences.workflows?.defaultMode ??
  (resolveAutonomy(preferences).mode === "explore"
    ? "party"
    : "accept-default");

const evidenceDiscipline = (autonomy: ResolvedAutonomy): string[] => {
  const lines = [
    "- Follow Otto's evidence hierarchy when judging completion: 1) real runtime behavior, 2) direct PRD or requirement validation, 3) human review of the working product, 4) automated tests and checks, 5) workflow or artifact completion signals.",
    "- Call out any simulated, mocked, placeholder, synthetic, or artifact-only success signals instead of treating them as equivalent to real target-surface evidence.",
    "- Include a machine-checkable evidence section in the response covering validation context, changed files, gate results, artifact references or transcripts, requirement mapping, risks, and follow-ups.",
  ];

  if (autonomy.approval === "strict") {
    lines.push(
      "- Treat approval-grade implementation or review work as strict approval: require explicit requirement mapping, real target-surface evidence when applicable, and a clear weak-evidence callout when runtime proof is missing.",
    );
  } else if (autonomy.approval === "balanced") {
    lines.push(
      "- Treat approval-grade work as balanced approval: map changed behavior to requirements, distinguish fully evidenced behavior from partial evidence, and call out what still needs stronger runtime proof.",
    );
  } else {
    lines.push(
      "- Treat approval claims as draft-grade: keep the requirement mapping, but you may leave work explicitly in exploratory or low-confidence status when runtime proof is still thin.",
    );
  }

  if (autonomy.evidence === "strict") {
    lines.push(
      "- Use a strict evidence threshold: if completion signals look strong but target-surface evidence is weak, lower confidence, mark the result as weak evidence, and steer toward validation or follow-up work.",
    );
  } else if (autonomy.evidence === "balanced") {
    lines.push(
      "- Use a balanced evidence threshold: accept partial progress, but explicitly separate runtime-confirmed behavior from artifact-only or inferred behavior.",
    );
  } else {
    lines.push(
      "- Use a relaxed evidence threshold for exploration: keep weak-evidence callouts visible, but avoid overstating certainty and reserve hard escalation for clear drift or placeholder-heavy delivery.",
    );
  }

  return lines;
};

const workflowPrompt = (
  command: WorkflowCommand,
  preferences: AutopilotPreferences,
  token: string,
): string => {
  const autonomy = resolveAutonomy(preferences);
  const workflow =
    command === "/bmad:td:initialize"
      ? {
          yaml: "_bmad/td-integration/workflows/initialize/workflow.yaml",
          instructions:
            "_bmad/td-integration/workflows/initialize/instructions.xml",
          extra:
            "If td has no open issues, treat that as setup-required and bootstrap planning + td mapping before finishing.",
        }
      : command === "/bmad:td:next-step"
        ? {
            yaml: "_bmad/td-integration/workflows/next-step/workflow.yaml",
            instructions:
              "_bmad/td-integration/workflows/next-step/instructions.xml",
            extra:
              "Use strict priority: reviews first, then ready issues, then epic maintenance workflows. Execute exactly one action, then stop and return.",
          }
        : command === "/bmad:td:validate-prd"
          ? {
              yaml: "_bmad/td-integration/workflows/validate-prd/workflow.yaml",
              instructions:
                "_bmad/td-integration/workflows/validate-prd/instructions.xml",
              extra:
                "Trace completed delivery against PRD requirements, create td tasks for actionable gaps, and stop after reporting coverage.",
            }
          : command === "/bmad:bmm:create-architecture"
            ? {
                yaml: "_bmad/bmm/workflows/3-solutioning/create-architecture/workflow.md",
                instructions:
                  "_bmad/bmm/workflows/3-solutioning/create-architecture/workflow.md",
                extra:
                  "Execute create-architecture from workflow files directly even if slash aliases are unavailable.",
              }
            : command === "/bmad:bmm:create-epics-and-stories"
              ? {
                  yaml: "_bmad/bmm/workflows/3-solutioning/create-epics-and-stories/workflow.md",
                  instructions:
                    "_bmad/bmm/workflows/3-solutioning/create-epics-and-stories/workflow.md",
                  extra:
                    "Execute create-epics-and-stories from workflow files directly even if slash aliases are unavailable.",
                }
              : command === "/bmad:bmm:create-story"
                ? {
                    yaml: "_bmad/bmm/workflows/4-implementation/create-story/workflow.yaml",
                    instructions:
                      "_bmad/bmm/workflows/4-implementation/create-story/instructions.xml",
                    extra:
                      "Execute create-story from workflow files directly and report the selected story.",
                  }
                : {
                    yaml: "_bmad/bmm/workflows/4-implementation/code-review/workflow.yaml",
                    instructions:
                      "_bmad/bmm/workflows/4-implementation/code-review/instructions.xml",
                    extra:
                      "Execute code-review from workflow files directly and report findings and decision.",
                  };

  const executionRequirements = [
    "- Follow workflow instructions directly and perform actions, not just explain them.",
    "- Prefer accept-default behavior and avoid unnecessary prompts.",
    `- ${workflow.extra}`,
    `- Operating mode: ${autonomy.mode}. Policy bundle: ${policySummary(autonomy)}.`,
    `- Workflow token: ${token}. Carry it through this run and include it unchanged in the final OTTO_RESULT JSON as key token.`,
    "- Report concrete actions taken, artifacts touched, and td outcomes.",
    ...evidenceDiscipline(autonomy),
    `- End your final response with exactly one line starting with ${RESULT_PREFIX} followed by valid single-line JSON with keys: command, token, action, issueId, issueTitle, outcome, confidence, summary. Use null for issueTitle when no td title applies.`,
    "- Use action from: review, implementation, requirements-validation, epic-workflow, unknown.",
    "- Use outcome from: completed, blocked, needs-input, no-work, failed, unknown.",
    "- Use confidence from: high, medium, low, unknown.",
  ];

  if (autonomy.steering === "interactive") {
    executionRequirements.push(
      "- Use interactive steering: surface major pivots, assumptions, and tradeoffs early, especially before architecture, planning, or validation decisions that could redirect the run.",
    );
  }

  if (workflowModeFor(command, preferences) === "party") {
    executionRequirements.push(
      "- Run this workflow in party mode: pause at major phase transitions, surface key options or tradeoffs, and wait for user direction before continuing.",
    );
  }

  return [
    `Execute BMAD workflow now: ${command}`,
    "",
    "Load and execute using these files:",
    "- _bmad/core/tasks/workflow.xml",
    `- ${workflow.yaml}`,
    `- ${workflow.instructions}`,
    "",
    "Execution requirements:",
    ...executionRequirements,
  ].join("\n");
};

const matchesQueuedWorkflowPrompt = (
  prompt: string,
  awaitingPrompt: string | null,
  awaitingCommand: string | null,
  awaitingToken: string | null,
): boolean => {
  const actual = prompt.trim();
  const expected = awaitingPrompt?.trim() ?? "";
  const command = awaitingCommand?.trim() ?? "";

  if (!actual) return false;
  if (expected && actual === expected) return true;
  if (command && actual === command) return true;
  if (awaitingToken && actual.includes(awaitingToken)) return true;

  const workflowBanner = command ? `Execute BMAD workflow now: ${command}` : "";
  if (workflowBanner && actual.includes(workflowBanner)) return true;

  if (expected) {
    const expectedFirstLine = expected.split("\n", 1)[0]?.trim() ?? "";
    if (expectedFirstLine && actual.includes(expectedFirstLine)) return true;
  }

  return false;
};

export default function otto(pi: ExtensionAPI) {
  const commandExecutor = new PiCommandExecutor(pi);
  let state = newRunState();
  let turnHadToolError = false;
  let onboardingHintShown = false;
  const getServices = createCachedOttoPiServices(pi);
  const runtimeController = new OttoPiRuntimeController(getServices, {
    getState: () => state,
    setState: (nextState) => {
      state = nextState;
    },
    persistState: (reason) => persistState(reason),
    updateUi: (ctx) => updateUi(ctx),
    stopRun: (ctx, phase, reason, stopCode) =>
      stopRun(ctx, phase, reason, stopCode),
    setContinuation: (continuity, reason) =>
      setContinuation(continuity, reason),
    queueWorkflowCommand: (ctx, command, reason) =>
      queueWorkflowCommand(ctx, command, reason),
    loadPreferenceInfo: () => {
      const loaded = loadAutopilotPreferences();
      return { source: loaded.source, error: loaded.error };
    },
  });

  const persistState = (reason: string): void => {
    pi.appendEntry(STATE_ENTRY_TYPE, {
      ...state,
      persistedAt: Date.now(),
      reason,
    });
  };

  const updateUi = (ctx: ExtensionContext): void => {
    if (!ctx.hasUI) return;

    const alert = stateAlert(state);
    const status = statusLabel(state, alert);

    ctx.ui.setStatus("otto", status);

    ctx.ui.setWidget(
      "otto",
      buildWidgetLines(state, state.lastIssueId, state.lastIssueTitle, alert),
    );

    if (state.lastIssueId && !state.lastIssueTitle) {
      const requestedIssueId = state.lastIssueId;
      void getTdIssueTitle(requestedIssueId).then((issueTitle) => {
        if (!issueTitle || state.lastIssueId !== requestedIssueId) return;
        if (state.lastIssueTitle === issueTitle) return;
        state.lastIssueTitle = issueTitle;
        updateUi(ctx);
      });
    }
  };

  const setContinuation = (
    continuity: ContinuityKind,
    reason: string,
  ): void => {
    state.lastContinuation = continuity;
    state.lastContinuationReason = shortText(reason, 160);
    state.lastProgressAt = Date.now();
  };

  const restoreState = (ctx: ExtensionContext): void => {
    const branch = ctx.sessionManager.getBranch();
    for (const entry of branch) {
      if (
        entry.type !== "custom" ||
        entry.customType !== STATE_ENTRY_TYPE ||
        typeof entry.data !== "object"
      )
        continue;
      const data = entry.data as Partial<RunState>;
      state = {
        ...newRunState(),
        ...state,
        ...data,
      };
    }
    updateUi(ctx);

    if (onboardingHintShown || !ctx.hasUI) return;
    const hasPreferences =
      loadAutopilotPreferences().source !== null ||
      branch.some(
        (entry) =>
          entry.type === "custom" &&
          entry.customType === ONBOARDING_MARKER_ENTRY_TYPE &&
          typeof entry.data === "object" &&
          entry.data !== null &&
          (entry.data as { version?: number }).version ===
            ONBOARDING_MARKER_VERSION,
      );
    if (hasPreferences) return;

    onboardingHintShown = true;
    ctx.ui.notify(PREFERENCE_ONBOARDING_HINT, "info");
  };

  const markOnboardingHintSeen = (): void => {
    onboardingHintShown = true;
    pi.appendEntry(ONBOARDING_MARKER_ENTRY_TYPE, {
      version: ONBOARDING_MARKER_VERSION,
      seenAt: Date.now(),
    });
  };

  const queueWorkflowCommand = (
    ctx: ExtensionContext,
    command: string,
    reason = "Operator requested workflow execution.",
  ): void => {
    const { preferences, source, error } = loadAutopilotPreferences();
    if (error) {
      state.lastError = `Preference load failed (${source}): ${error}`;
    }
    const autonomy = resolveAutonomy(preferences);
    const token = newWorkflowToken();
    const prompt = workflowPrompt(
      command as WorkflowCommand,
      preferences,
      token,
    );
    const mode = workflowModeFor(command as WorkflowCommand, preferences);
    void commandExecutor.queueWorkflowCommand(command, prompt, {
      followUp: !ctx.isIdle(),
    });
    state = applyQueuedWorkflow(state, {
      command,
      prompt,
      token,
      reason: shortText(reason, 160),
      commandMode: mode,
      autonomyMode: autonomy.mode,
      policySummary: policySummary(autonomy),
    });
    persistState(`queued:${command}`);
    updateUi(ctx);
  };

  const queueNextStepIteration = (ctx: ExtensionContext): void => {
    runtimeController.queueNextStepIteration(ctx, NEXT_STEP_COMMAND);
  };

  const hasRemainingWork = async (): Promise<{
    hasImmediateWork: boolean;
    hasInReview: boolean;
  }> => {
    const [reviewable, ready, inReview] = await Promise.all([
      commandExecutor.executeShell("td", ["reviewable"], 20000),
      commandExecutor.executeShell("td", ["ready"], 20000),
      commandExecutor.executeShell("td", ["in-review"], 20000),
    ]);

    return parseOttoRemainingWork(
      reviewable.stdout,
      ready.stdout,
      inReview.stdout,
    );
  };

  const stopRun = (
    ctx: ExtensionContext,
    phase: Phase,
    reason: string,
    stopCode: StopCode,
  ): void => {
    state = applyStopState(state, phase, reason, stopCode);
    persistState(`stop:${phase}`);
    updateUi(ctx);
    if (ctx.hasUI) {
      const notification = buildStopNotification(phase, reason);
      ctx.ui.notify(notification.message, notification.level);
    }
  };

  const registerLoopFailure = (
    ctx: ExtensionContext,
    message: string,
    phase: Phase = "error",
  ): boolean => {
    state = applyFailureState(state, message);

    if (state.failures >= state.maxFailures) {
      stopRun(
        ctx,
        phase,
        buildFailureBudgetReason(message, state.failures, state.maxFailures),
        "failure-budget-reached",
      );
      return true;
    }

    persistState(`failure:${phase}`);
    updateUi(ctx);
    return false;
  };

  const registerWorkflowCommand = (
    name: string,
    command: WorkflowCommand,
    description: string,
  ): void => {
    pi.registerCommand(name, {
      description,
      handler: async (_args, ctx) => {
        const { preferences, source, error } = loadAutopilotPreferences();
        const prompt = workflowPrompt(command, preferences, newWorkflowToken());
        await commandExecutor.queueWorkflowCommand(command, prompt, {
          followUp: !ctx.isIdle(),
        });
        if (error && ctx.hasUI) {
          getServices(ctx).ui.notify(
            `Otto preferences fallback: ${source} could not be loaded (${error})`,
            "warning",
          );
        }
        getServices(ctx).ui.notify(`Queued ${command}`, "info");
      },
    });
  };

  pi.on("session_start", async (_event, ctx) => restoreState(ctx));
  pi.on("session_switch", async (_event, ctx) => restoreState(ctx));
  pi.on("session_fork", async (_event, ctx) => restoreState(ctx));
  pi.on("session_tree", async (_event, ctx) => restoreState(ctx));

  pi.on("turn_start", async () => {
    turnHadToolError = startOttoTurn();
  });

  pi.on("tool_result", async (event) => {
    if (state.active && event.isError) {
      const result = registerOttoToolError(state, event.toolName);
      state = result.state;
      turnHadToolError = result.turnHadToolError;
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!state.active) return;
    if (
      matchesQueuedWorkflowPrompt(
        event.prompt,
        state.awaitingPrompt,
        state.awaitingCommand,
        state.awaitingToken,
      )
    ) {
      state = markAwaitingWorkflowStarted(state);
      updateUi(ctx);
    }
  });

  pi.on("agent_end", async (event, ctx) => {
    if (shouldIgnoreAgentEnd(state)) return;

    const completion = completeAwaitingWorkflowStart(state);
    state = completion.state;
    const completedCommand = completion.completedCommand;
    const completedToken = completion.completedToken;
    if (!completedCommand) return;

    if (completedCommand === CONTINUE_COMMAND) {
      if (ctx.hasUI) {
        ctx.ui.notify(
          "Session-hop command was interpreted as a prompt; falling back to same-session compacted iteration.",
          "warning",
        );
      }
      runtimeController.compactAndQueueNextStep(ctx, NEXT_STEP_COMMAND);
      return;
    }

    const assistantText = extractAssistantText(event.messages as unknown[]);
    const resolvedWorkflowResult = resolveWorkflowResult(
      assistantText,
      completedCommand,
      completedToken,
    );
    const workflowResult = resolvedWorkflowResult.result;
    const summary = resolvedWorkflowResult.summary;
    const evidence = inspectEvidence(
      assistantText,
      workflowResult,
      resolveAutonomy(loadAutopilotPreferences().preferences).evidence,
    );
    const entryId = ctx.sessionManager.getLeafId();
    const issueId = workflowResult?.issueId ?? parseIssueId(assistantText);
    const issueTitle =
      workflowResult?.issueTitle ?? parseIssueTitle(assistantText, issueId);

    state = applyAgentResultUpdate(state, {
      issueId,
      issueTitle,
      action: workflowResult?.action ?? classifyAction(assistantText),
      outcome: workflowResult?.outcome ?? classifyOutcome(assistantText),
      confidence: evidence.effectiveConfidence,
      resultSource: resolvedWorkflowResult.resultSource,
      evidenceAlert: evidence.alert,
      evidenceSignals: evidence.signals,
      error: resolvedWorkflowResult.error,
    });

    const alert = stateAlert(state);

    if (entryId) {
      state = appendOttoCheckpoint(state, {
        entryId,
        command: completedCommand,
        issueId,
        issueTitle,
        action: workflowResult?.action ?? classifyAction(assistantText),
        outcome: workflowResult?.outcome ?? classifyOutcome(assistantText),
        confidence: evidence.effectiveConfidence,
        alert,
        evidenceSignals: evidence.signals,
        reason: state.lastDecisionReason,
        summary,
      });
      pi.setLabel(
        entryId,
        `auto:${state.runId ?? "run"}:iter-${state.iteration}`,
      );
    }

    if (resolvedWorkflowResult.error) {
      if (registerLoopFailure(ctx, resolvedWorkflowResult.error)) return;
    }

    if (turnHadToolError) {
      if (registerLoopFailure(ctx, state.lastError ?? "A tool failed.")) return;
    }

    if (workflowResult?.outcome === "failed") {
      if (
        registerLoopFailure(
          ctx,
          `Workflow reported failure for ${completedCommand}.`,
        )
      )
        return;
    }

    if (workflowResult?.outcome === "needs-input") {
      stopRun(
        ctx,
        "paused",
        `Workflow requested user input for ${completedCommand}.`,
        "paused-for-input",
      );
      return;
    }

    if (workflowResult?.outcome === "blocked") {
      stopRun(
        ctx,
        "paused",
        `Workflow reported blocked state for ${completedCommand}.`,
        "blocked-workflow",
      );
      return;
    }

    if (completedCommand === INIT_COMMAND) {
      state = applyInitCompletion(state);
      persistState("init-complete");
      if (ctx.hasUI) {
        ctx.ui.notify(
          "Initialization complete, starting next-step loop.",
          "success",
        );
      }
      queueNextStepIteration(ctx);
      return;
    }

    state = advanceOttoIteration(state);
    if (state.iteration >= state.maxIterations) {
      stopRun(
        ctx,
        "completed",
        `Reached max iterations (${state.maxIterations}).`,
        "max-iterations-reached",
      );
      return;
    }

    let workLeft = false;
    let hasInReview = false;
    try {
      const workState = await hasRemainingWork();
      const autonomy = resolveAutonomy(loadAutopilotPreferences().preferences);
      workLeft = workState.hasImmediateWork;
      hasInReview = workState.hasInReview;
      state = updateOttoQueueState(
        state,
        resolveOttoQueueStateFromWork(state, workState),
      );
      state.lastError = null;

      if (state.lastOutcome === "no-work" && (workLeft || hasInReview)) {
        const tdDriftReason = buildOttoTdDriftReason(workState);
        const evidenceSignals = mergeOttoEvidenceSignals(
          state.lastEvidenceSignals,
          ["td-drift", "result-drift"],
        );
        state = markOttoTdDrift(
          state,
          shortText(tdDriftReason, 160),
          evidenceSignals,
        );

        if (ctx.hasUI) {
          ctx.ui.notify(tdDriftReason, "warning");
        }

        const driftAction = resolveOttoTdDriftAction({
          driftPolicy: autonomy.drift,
          completedCommand,
          validatePrdCommand: VALIDATE_PRD_COMMAND,
        });

        if (driftAction === "pause") {
          stopRun(
            ctx,
            "paused",
            `${tdDriftReason} Drift policy is pause.`,
            "paused-for-input",
          );
          return;
        }

        if (driftAction === "validate") {
          state = updateOttoQueueState(state, "drained-ready-for-validation");
          persistState("loop-run-validate-prd-td-drift");
          queueWorkflowCommand(
            ctx,
            VALIDATE_PRD_COMMAND,
            `${tdDriftReason} Drift policy is validate, so check product truth before continuing.`,
          );
          return;
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown td check failure";
      if (registerLoopFailure(ctx, message)) return;
      workLeft = true;
    }

    if (!workLeft) {
      const decision = resolveOttoQueueDrainDecision({
        state,
        completedCommand,
        nextStepCommand: NEXT_STEP_COMMAND,
        validatePrdCommand: VALIDATE_PRD_COMMAND,
        hasInReview,
        shouldValidate: evidence.shouldValidate,
        evidenceSignals: evidence.signals,
      });
      state = decision.state;

      if (decision.action.kind === "continue-next-step") {
        persistState(decision.action.persistReason);
        queueNextStepIteration(ctx);
        return;
      }

      if (decision.action.kind === "queue-validate-prd") {
        persistState(decision.action.persistReason);
        queueWorkflowCommand(ctx, VALIDATE_PRD_COMMAND, decision.action.prompt);
        return;
      }

      if (decision.action.kind === "stop-completed") {
        stopRun(
          ctx,
          decision.action.phase,
          decision.action.reason,
          decision.action.stopCode,
        );
        return;
      }

      return;
    }

    state = resetOttoQueueProgress(state);

    persistState("loop-continue");
    queueNextStepIteration(ctx);
  });

  const registerOttoCommand = (
    primaryName: string,
    legacyName: string,
    description: string,
    handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>,
  ): void => {
    pi.registerCommand(primaryName, {
      description,
      handler,
    });
    pi.registerCommand(legacyName, {
      description: `Alias for /${primaryName}`,
      handler,
    });
  };

  const continueHandler = async (
    _args: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> => {
    if (!state.active || state.phase !== "running") return;

    state.awaitingCommand = null;
    state.awaitingPrompt = null;
    state.awaitingToken = null;
    state.awaitingStarted = false;
    persistState("session-hop-command-received");
    updateUi(ctx);

    const result = await getServices(ctx).sessionControl.rotate();
    if (result.status === "cancelled") {
      stopRun(
        ctx,
        "error",
        "Session rotation cancelled.",
        "session-rotation-cancelled",
      );
      return;
    }

    if (result.status === "unsupported") {
      stopRun(
        ctx,
        "error",
        "Session rotation is unavailable in this Pi runtime.",
        "session-rotation-unsupported",
      );
      return;
    }

    if (result.status === "failed") {
      stopRun(
        ctx,
        "error",
        "Session rotation failed.",
        "session-rotation-failed",
      );
      return;
    }

    persistState("session-rotated");
    updateUi(ctx);
    queueWorkflowCommand(
      ctx,
      NEXT_STEP_COMMAND,
      "Fresh session created successfully; continue with the next-step workflow.",
    );
  };

  registerOttoCommand(
    "otto-continue",
    "bmad-auto-continue",
    "Internal: continue Otto in a fresh session",
    continueHandler,
  );

  registerWorkflowCommand(
    "bmad:td:initialize",
    "/bmad:td:initialize",
    "Run BMAD td initialize workflow",
  );
  registerWorkflowCommand(
    "bmad:td:next-step",
    "/bmad:td:next-step",
    "Run BMAD td next-step workflow",
  );
  registerWorkflowCommand(
    "bmad:td:validate-prd",
    "/bmad:td:validate-prd",
    "Run BMAD td PRD validation workflow",
  );
  registerWorkflowCommand(
    "bmad-td-initialize",
    "/bmad:td:initialize",
    "Alias for /bmad:td:initialize",
  );
  registerWorkflowCommand(
    "bmad-td-next-step",
    "/bmad:td:next-step",
    "Alias for /bmad:td:next-step",
  );
  registerWorkflowCommand(
    "bmad-td-validate-prd",
    "/bmad:td:validate-prd",
    "Alias for /bmad:td:validate-prd",
  );
  registerWorkflowCommand(
    "bmad:bmm:create-architecture",
    "/bmad:bmm:create-architecture",
    "Run BMAD create-architecture workflow",
  );
  registerWorkflowCommand(
    "bmad-bmm-create-architecture",
    "/bmad:bmm:create-architecture",
    "Alias for /bmad:bmm:create-architecture",
  );
  registerWorkflowCommand(
    "bmad:bmm:create-epics-and-stories",
    "/bmad:bmm:create-epics-and-stories",
    "Run BMAD create-epics-and-stories workflow",
  );
  registerWorkflowCommand(
    "bmad-bmm-create-epics-and-stories",
    "/bmad:bmm:create-epics-and-stories",
    "Alias for /bmad:bmm:create-epics-and-stories",
  );
  registerWorkflowCommand(
    "bmad:bmm:create-story",
    "/bmad:bmm:create-story",
    "Run BMAD create-story workflow",
  );
  registerWorkflowCommand(
    "bmad-bmm-create-story",
    "/bmad:bmm:create-story",
    "Alias for /bmad:bmm:create-story",
  );
  registerWorkflowCommand(
    "bmad:bmm:code-review",
    "/bmad:bmm:code-review",
    "Run BMAD code-review workflow",
  );
  registerWorkflowCommand(
    "bmad-bmm-code-review",
    "/bmad:bmm:code-review",
    "Alias for /bmad:bmm:code-review",
  );

  const startHandler = async (
    args: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> => {
    if (state.active && state.phase !== "paused") {
      getServices(ctx).ui.notify("Otto is already running.", "warning");
      return;
    }

    const parsed = parseStartArgs(args);
    const { preferences } = loadAutopilotPreferences();
    const defaults = preferences.defaults;
    const now = Date.now();
    const freshSessionBetweenSteps =
      parsed.sameSession !== undefined
        ? false
        : (defaults?.freshSessionBetweenSteps ?? true);
    const skipInit = parsed.skipInit ?? defaults?.skipInit ?? false;
    const initialCommand = skipInit ? NEXT_STEP_COMMAND : INIT_COMMAND;

    state = initializeOttoRunState({
      runId: `run-${now}`,
      phase: skipInit ? "running" : "initializing",
      maxIterations:
        parsed.maxIterations ?? defaults?.maxIterations ?? state.maxIterations,
      maxFailures:
        parsed.maxFailures ?? defaults?.maxFailures ?? state.maxFailures,
      freshSessionBetweenSteps,
      awaitingCommand: initialCommand,
      queueState: skipInit ? "ready" : "unknown",
      now,
    });

    const sessionPolicy = resolveOttoSessionPolicy(freshSessionBetweenSteps);
    await runtimeController.start({
      ctx,
      sessionPolicy,
      initialCommand,
      skipInit,
    });
  };

  registerOttoCommand(
    "otto-start",
    "bmad-auto-start",
    "Start Otto initialize -> next-step loop",
    startHandler,
  );

  const onboardHandler = async (
    _args: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> => {
    const saved = await runOnboarding(ctx);
    if (!saved) return;
    markOnboardingHintSeen();
  };

  registerOttoCommand(
    "otto-onboard",
    "bmad-auto-onboard",
    "Set Otto project preferences with an onboarding flow",
    onboardHandler,
  );

  const statusHandler = async (
    _args: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> => {
    runtimeController.renderStatus(ctx, state, {
      currentIssueLabel: currentIssueLabel(
        state.lastIssueId,
        state.lastIssueTitle,
      ),
      reasonLabel: widgetReasonLabel(state.lastDecisionReason),
      continuityLabel: continuityLabel(
        state.lastContinuation,
        state.lastContinuationReason,
      ),
      alert: stateAlert(state),
      sessionAlert: sessionSupportAlert(state),
    });
  };

  registerOttoCommand(
    "otto-status",
    "bmad-auto-status",
    "Show Otto state summary",
    statusHandler,
  );

  const checkHandler = async (
    _args: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> => {
    const services = getServices(ctx);
    const inspection = buildRuntimeInspection(
      pi,
      ctx,
      state.lastSessionHandle?.metadataPath ?? null,
    );

    services.ui.renderInspection(inspection);

    const sessions = await services.sessions.listSessions({
      runId: state.runId ?? undefined,
      limit: 8,
    });

    services.ui.notify(
      [
        `Tracked Otto sessions: ${sessions.length}`,
        ...sessions.map((session) => formatSessionListLine(session, ctx.cwd)),
      ].join("\n"),
      "info",
    );
  };

  registerOttoCommand(
    "otto-check",
    "bmad-auto-check",
    "Inspect Otto runtime and tracked sessions",
    checkHandler,
  );

  const sessionsHandler = async (
    _args: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> => {
    const services = getServices(ctx);
    const sessions = await services.sessions.listSessions({ limit: 20 });

    if (sessions.length === 0) {
      services.ui.notify("No Otto-managed sessions recorded yet.", "warning");
      return;
    }

    services.ui.notify(
      [
        "Known Otto sessions:",
        ...sessions.map((session) => formatSessionListLine(session, ctx.cwd)),
      ].join("\n"),
      "info",
    );
  };

  registerOttoCommand(
    "otto-sessions",
    "bmad-auto-sessions",
    "List Otto-managed sessions for recovery",
    sessionsHandler,
  );

  const pauseHandler = async (
    _args: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> => {
    const services = getServices(ctx);
    if (!state.active) {
      services.ui.notify("Otto is not running.", "warning");
      return;
    }
    state = pauseOttoRunState(state);
    persistState("pause");
    updateUi(ctx);
    services.ui.notify("Otto paused.", "info");
  };

  registerOttoCommand(
    "otto-pause",
    "bmad-auto-pause",
    "Pause Otto after current turn",
    pauseHandler,
  );

  const resumeHandler = async (
    args: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> => {
    if (!state.active || state.phase !== "paused") {
      getServices(ctx).ui.notify("Otto is not paused.", "warning");
      return;
    }

    const requestedSession = args.trim();
    if (requestedSession) {
      try {
        await ctx.waitForIdle();
        const switched = await ctx.switchSession(requestedSession);
        if (switched.cancelled) {
          getServices(ctx).ui.notify(
            `Otto resume could not switch to ${requestedSession}.`,
            "warning",
          );
          return;
        }
      } catch (error) {
        getServices(ctx).ui.notify(
          `Otto resume session switch failed: ${error instanceof Error ? error.message : String(error)}`,
          "warning",
        );
        return;
      }
    }

    await runtimeController.resume(
      ctx,
      NEXT_STEP_COMMAND,
      requestedSession
        ? `${resumeNextStepReason()} Operator selected ${requestedSession}.`
        : resumeNextStepReason(),
    );
  };

  registerOttoCommand(
    "otto-resume",
    "bmad-auto-resume",
    "Resume Otto loop",
    resumeHandler,
  );

  const stopHandler = async (
    args: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> => {
    const services = getServices(ctx);
    if (!state.active) {
      services.ui.notify("Otto is not running.", "warning");
      return;
    }
    const reason = args.trim() || "Stopped manually.";
    stopRun(ctx, "stopped", reason, "manual-stop");
  };

  registerOttoCommand(
    "otto-stop",
    "bmad-auto-stop",
    "Stop Otto loop",
    stopHandler,
  );

  const diveHandler = async (
    _args: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> => {
    const services = getServices(ctx);
    if (!services.ui.isInteractive()) {
      services.ui.notify("/otto-dive requires interactive mode.", "error");
      return;
    }
    if (state.checkpoints.length === 0) {
      services.ui.notify("No Otto checkpoints available.", "warning");
      return;
    }

    const recent = [...state.checkpoints].reverse().slice(0, 30);
    const options = recent.map((checkpoint) => checkpointLabel(checkpoint));

    const selected = await services.ui.select("Otto checkpoints", options);
    if (!selected) return;

    const index = options.indexOf(selected);
    if (index < 0) return;
    const checkpoint = recent[index];

    const action = await services.ui.select(
      "Checkpoint action",
      checkpointActionOptions(checkpoint),
    );
    if (!action) return;

    if (action.startsWith("Show details")) {
      services.ui.notify(
        [
          `Checkpoint: #${checkpoint.iteration}`,
          `Time: ${new Date(checkpoint.timestamp).toLocaleString()}`,
          `td: ${currentIssueLabel(checkpoint.issueId, checkpoint.issueTitle)}`,
          `Command: ${checkpoint.command}`,
          `Action: ${checkpoint.action ?? "-"}`,
          `Outcome: ${checkpoint.outcome ?? "-"}`,
          `Confidence: ${checkpoint.confidence}`,
          `Continuity: ${continuityLabel(checkpoint.continuity, checkpoint.continuityReason)}`,
          `Queue state: ${checkpoint.queueState}`,
          `Alert: ${checkpoint.alert ?? "-"}`,
          `Evidence: ${
            checkpoint.evidenceSignals.length > 0
              ? checkpoint.evidenceSignals.join(", ")
              : "-"
          }`,
          `Why: ${widgetReasonLabel(checkpoint.reason)}`,
          `Summary: ${checkpoint.summary}`,
        ].join("\n"),
        "info",
      );
      return;
    }

    if (action.startsWith("Navigate here")) {
      await ctx.navigateTree(checkpoint.entryId, {
        summarize: true,
        label: `dive:${state.runId ?? "run"}:iter-${checkpoint.iteration}`,
      });
      return;
    }

    await ctx.fork(checkpoint.entryId);
  };

  registerOttoCommand(
    "otto-dive",
    "bmad-auto-dive",
    "Navigate or fork at an Otto checkpoint",
    diveHandler,
  );
}
