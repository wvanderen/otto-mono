import type {
  OttoActionKind,
  OttoConfidenceKind,
  OttoContinuityKind,
  OttoOperatingMode,
  OttoOutcomeKind,
  OttoPhase,
  OttoQueueState,
  OttoResultSourceKind,
  OttoSessionPolicy,
  OttoSessionRotationOutcome,
  OttoSessionSupport,
  OttoStatusSnapshot,
  OttoStopCode,
  OttoWorkflowMode,
} from "./contracts";

export interface OttoCheckpoint {
  iteration: number;
  entryId: string;
  command: string;
  issueId: string | null;
  issueTitle: string | null;
  action: OttoActionKind | null;
  outcome: OttoOutcomeKind | null;
  confidence: OttoConfidenceKind;
  queueState: OttoQueueState;
  continuity: OttoContinuityKind;
  continuityReason: string | null;
  alert: string | null;
  evidenceSignals: string[];
  reason: string | null;
  summary: string;
  timestamp: number;
}

export interface OttoCoreState extends OttoStatusSnapshot {
  version: number;
  active: boolean;
  maxIterations: number;
  maxFailures: number;
  lastCommand: string | null;
  lastAction: OttoActionKind | null;
  lastDecisionReason: string | null;
  lastOutcome: OttoOutcomeKind | null;
  lastConfidence: OttoConfidenceKind;
  lastResultSource: OttoResultSourceKind;
  lastEvidenceAlert: string | null;
  lastEvidenceSignals: string[];
  lastCommandMode: OttoWorkflowMode;
  lastAutonomyMode: OttoOperatingMode;
  lastPolicySummary: string;
  lastContinuation: OttoContinuityKind;
  lastContinuationReason: string | null;
  lastIssueId: string | null;
  lastIssueTitle: string | null;
  lastError: string | null;
  lastProgressAt: number;
  emptyQueuePasses: number;
  checkpoints: OttoCheckpoint[];
  awaitingCommand: string | null;
  awaitingPrompt: string | null;
  awaitingToken: string | null;
  awaitingStarted: boolean;
  freshSessionBetweenSteps: boolean;
}

export interface OttoCoreStateOptions {
  runId?: string | null;
  phase?: OttoPhase;
  sessionPolicy?: OttoSessionPolicy;
  sessionSupport?: OttoSessionSupport;
  lastSessionRotation?: OttoSessionRotationOutcome;
  stopCode?: OttoStopCode;
  stopReason?: string | null;
  queueState?: OttoQueueState;
  iteration?: number;
  failures?: number;
  maxIterations?: number;
  maxFailures?: number;
}

export const createOttoCoreState = (
  options: OttoCoreStateOptions = {},
): OttoCoreState => ({
  version: 1,
  runId: options.runId ?? null,
  active: false,
  phase: options.phase ?? "idle",
  stopCode: options.stopCode ?? "none",
  stopReason: options.stopReason ?? null,
  sessionPolicy: options.sessionPolicy ?? "require-fresh",
  sessionSupport: options.sessionSupport ?? "unknown",
  lastSessionRotation: options.lastSessionRotation ?? "not-attempted",
  queueState: options.queueState ?? "unknown",
  iteration: options.iteration ?? 0,
  maxIterations: options.maxIterations ?? 25,
  failures: options.failures ?? 0,
  maxFailures: options.maxFailures ?? 3,
  lastCommand: null,
  lastAction: null,
  lastDecisionReason: null,
  lastOutcome: null,
  lastConfidence: "unknown",
  lastResultSource: null,
  lastEvidenceAlert: null,
  lastEvidenceSignals: [],
  lastCommandMode: "accept-default",
  lastAutonomyMode: "delivery",
  lastPolicySummary:
    "approval=strict, drift=validate, evidence=strict, steering=steady",
  lastContinuation: "none",
  lastContinuationReason: null,
  lastIssueId: null,
  lastIssueTitle: null,
  lastError: null,
  lastProgressAt: Date.now(),
  emptyQueuePasses: 0,
  checkpoints: [],
  awaitingCommand: null,
  awaitingPrompt: null,
  awaitingToken: null,
  awaitingStarted: false,
  freshSessionBetweenSteps: true,
});

export const toStatusSnapshot = (state: OttoCoreState): OttoStatusSnapshot => ({
  runId: state.runId,
  phase: state.phase,
  stopCode: state.stopCode,
  stopReason: state.stopReason,
  sessionPolicy: state.sessionPolicy,
  sessionSupport: state.sessionSupport,
  lastSessionRotation: state.lastSessionRotation,
  queueState: state.queueState,
  iteration: state.iteration,
  failures: state.failures,
});

export const createWorkflowToken = (): string =>
  `otto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export interface OttoQueueCommandStateOptions {
  command: string;
  prompt: string | null;
  token: string | null;
  reason: string;
  commandMode: OttoWorkflowMode;
  autonomyMode: OttoOperatingMode;
  policySummary: string;
  now?: number;
}

export const queueOttoCommandState = (
  state: OttoCoreState,
  options: OttoQueueCommandStateOptions,
): OttoCoreState => ({
  ...state,
  awaitingCommand: options.command,
  awaitingPrompt: options.prompt,
  awaitingToken: options.token,
  awaitingStarted: false,
  lastCommand: options.command,
  lastCommandMode: options.commandMode,
  lastAutonomyMode: options.autonomyMode,
  lastPolicySummary: options.policySummary,
  lastDecisionReason: options.reason,
  lastProgressAt: options.now ?? Date.now(),
});

export const clearOttoAwaitingState = (
  state: OttoCoreState,
  now = Date.now(),
): OttoCoreState => ({
  ...state,
  awaitingCommand: null,
  awaitingPrompt: null,
  awaitingToken: null,
  awaitingStarted: false,
  lastProgressAt: now,
});

export const stopOttoState = (
  state: OttoCoreState,
  phase: OttoPhase,
  reason: string,
  stopCode: OttoStopCode,
  now = Date.now(),
): OttoCoreState => ({
  ...clearOttoAwaitingState(state, now),
  active: false,
  phase,
  stopReason: reason,
  stopCode,
});

export const registerOttoFailure = (
  state: OttoCoreState,
  message: string,
  now = Date.now(),
): OttoCoreState => ({
  ...state,
  failures: state.failures + 1,
  lastError: message,
  lastProgressAt: now,
});

export interface OttoRunInitializationOptions {
  runId: string;
  phase: OttoPhase;
  maxIterations: number;
  maxFailures: number;
  freshSessionBetweenSteps: boolean;
  awaitingCommand: string;
  queueState: OttoQueueState;
  now?: number;
}

export const initializeOttoRunState = (
  options: OttoRunInitializationOptions,
): OttoCoreState => ({
  ...createOttoCoreState({
    runId: options.runId,
    phase: options.phase,
    maxIterations: options.maxIterations,
    maxFailures: options.maxFailures,
    queueState: options.queueState,
  }),
  active: true,
  freshSessionBetweenSteps: options.freshSessionBetweenSteps,
  awaitingCommand: options.awaitingCommand,
  lastProgressAt: options.now ?? Date.now(),
  stopCode: "none",
});

export const resumeOttoRunState = (
  state: OttoCoreState,
  awaitingCommand: string,
  now = Date.now(),
): OttoCoreState => ({
  ...state,
  phase: "running",
  stopReason: null,
  stopCode: "none",
  awaitingCommand,
  awaitingPrompt: null,
  awaitingToken: null,
  awaitingStarted: false,
  lastProgressAt: now,
});

export const pauseOttoRunState = (
  state: OttoCoreState,
  now = Date.now(),
): OttoCoreState => ({
  ...state,
  phase: "paused",
  lastProgressAt: now,
});

export interface OttoSessionStatusUpdate {
  sessionPolicy?: OttoCoreState["sessionPolicy"];
  sessionSupport: OttoCoreState["sessionSupport"];
  lastSessionRotation: OttoCoreState["lastSessionRotation"];
  lastError?: string | null;
}

export const applyOttoSessionStatus = (
  state: OttoCoreState,
  update: OttoSessionStatusUpdate,
): OttoCoreState => ({
  ...state,
  sessionPolicy: update.sessionPolicy ?? state.sessionPolicy,
  sessionSupport: update.sessionSupport,
  lastSessionRotation: update.lastSessionRotation,
  lastError: update.lastError ?? state.lastError,
});
