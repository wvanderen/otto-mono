import type {
  OttoActionKind,
  OttoConfidenceKind,
  OttoCoreState,
  OttoOutcomeKind,
  OttoResultSourceKind,
} from "./state";

export interface OttoAgentResultUpdate {
  issueId: string | null;
  issueTitle: string | null;
  action: OttoActionKind | null;
  outcome: OttoOutcomeKind | null;
  confidence: OttoConfidenceKind;
  resultSource: OttoResultSourceKind;
  evidenceAlert: string | null;
  evidenceSignals: string[];
  error: string | null;
  now?: number;
}

export const applyAgentResultUpdate = (
  state: OttoCoreState,
  update: OttoAgentResultUpdate,
): OttoCoreState => {
  const previousIssueId = state.lastIssueId;
  return {
    ...state,
    lastIssueId: update.issueId ?? state.lastIssueId,
    lastIssueTitle:
      update.issueTitle ??
      (update.issueId === previousIssueId ? state.lastIssueTitle : null),
    lastAction: update.action,
    lastOutcome: update.outcome,
    lastConfidence: update.confidence,
    lastResultSource: update.resultSource,
    lastEvidenceAlert: update.evidenceAlert,
    lastEvidenceSignals: update.evidenceSignals,
    lastProgressAt: update.now ?? Date.now(),
    lastError: update.error,
  };
};

export interface OttoCheckpointInput {
  entryId: string;
  command: string;
  issueId: string | null;
  issueTitle: string | null;
  action: OttoActionKind | null;
  outcome: OttoOutcomeKind | null;
  confidence: OttoConfidenceKind;
  alert: string | null;
  evidenceSignals: string[];
  reason: string | null;
  summary: string;
  timestamp?: number;
}

export const appendOttoCheckpoint = (
  state: OttoCoreState,
  checkpoint: OttoCheckpointInput,
): OttoCoreState => {
  const nextCheckpoints = [
    ...state.checkpoints,
    {
      iteration: state.iteration,
      entryId: checkpoint.entryId,
      command: checkpoint.command,
      issueId: checkpoint.issueId,
      issueTitle: checkpoint.issueTitle,
      action: checkpoint.action,
      outcome: checkpoint.outcome,
      confidence: checkpoint.confidence,
      queueState: state.queueState,
      continuity: state.lastContinuation,
      continuityReason: state.lastContinuationReason,
      alert: checkpoint.alert,
      evidenceSignals: checkpoint.evidenceSignals,
      reason: checkpoint.reason,
      summary: checkpoint.summary,
      timestamp: checkpoint.timestamp ?? Date.now(),
    },
  ];

  return {
    ...state,
    checkpoints: nextCheckpoints.slice(-100),
  };
};

export const markOttoTdDrift = (
  state: OttoCoreState,
  reason: string,
  evidenceSignals: string[],
): OttoCoreState => {
  const checkpoints = [...state.checkpoints];
  const checkpoint = checkpoints.at(-1);
  if (checkpoint) {
    checkpoint.evidenceSignals = evidenceSignals;
    checkpoint.alert = "td drift";
    checkpoint.confidence = "low";
    checkpoint.reason = reason;
  }

  return {
    ...state,
    checkpoints,
    lastEvidenceSignals: evidenceSignals,
    lastEvidenceAlert: "td drift",
    lastConfidence: "low",
    lastDecisionReason: reason,
  };
};
