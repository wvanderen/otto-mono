import type { OttoCoreState, OttoStatusSnapshot } from "./state";

export interface OttoStatusReportOptions {
  preferencesSource: string | null;
  preferenceError: string | null;
  currentIssueLabel: string;
  reasonLabel: string;
  continuityLabel: string;
  alert: string | null;
}

export const buildOttoStatusDetail = (
  state: OttoCoreState,
  options: OttoStatusReportOptions,
): string => {
  const status = [
    `Run: ${state.runId ?? "none"}`,
    `Preferences: ${options.preferencesSource ?? "built-in defaults"}`,
    `Current td: ${options.currentIssueLabel}`,
    `Action: ${state.lastAction ?? "-"}`,
    `Why: ${options.reasonLabel}`,
    `Operating mode: ${state.lastAutonomyMode}`,
    `Policies: ${state.lastPolicySummary}`,
    `Workflow mode: ${state.lastCommandMode}`,
    `Phase: ${state.phase}`,
    `Active: ${state.active ? "yes" : "no"}`,
    `Iteration: ${state.iteration}/${state.maxIterations}`,
    `Failures: ${state.failures}/${state.maxFailures}`,
    `Last command: ${state.lastCommand ?? "-"}`,
    `Last outcome: ${state.lastOutcome ?? "-"}`,
    `Confidence: ${state.lastConfidence}`,
    `Evidence: ${
      state.lastEvidenceSignals.length > 0
        ? state.lastEvidenceSignals.join(", ")
        : "-"
    }`,
    `Continuity: ${options.continuityLabel}`,
    `Session policy: ${state.sessionPolicy}`,
    `Session support: ${state.sessionSupport}`,
    `Last rotation: ${state.lastSessionRotation}`,
    `Result source: ${state.lastResultSource ?? "-"}`,
    `Queue state: ${state.queueState}`,
    `Stop code: ${state.stopCode}`,
    `Stop reason: ${state.stopReason ?? "-"}`,
  ].join("\n");

  const detailLines = [status];
  if (options.alert) detailLines.push(`Alert: ${options.alert}`);
  if (options.preferenceError) {
    detailLines.push(`Preference warning: ${options.preferenceError}`);
  }
  return detailLines.join("\n");
};

export const buildOttoStatusSnapshot = (
  state: OttoCoreState,
): OttoStatusSnapshot => ({
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
