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
