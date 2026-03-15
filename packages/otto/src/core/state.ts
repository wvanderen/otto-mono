import type {
  OttoPhase,
  OttoSessionPolicy,
  OttoSessionRotationOutcome,
  OttoSessionSupport,
  OttoStatusSnapshot,
  OttoStopCode,
} from "./contracts";

export interface OttoCoreState extends OttoStatusSnapshot {
  version: number;
  active: boolean;
  iteration: number;
  maxIterations: number;
  failures: number;
  maxFailures: number;
}

export interface OttoCoreStateOptions {
  runId?: string | null;
  phase?: OttoPhase;
  sessionPolicy?: OttoSessionPolicy;
  sessionSupport?: OttoSessionSupport;
  lastSessionRotation?: OttoSessionRotationOutcome;
  stopCode?: OttoStopCode;
  stopReason?: string | null;
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
  iteration: 0,
  maxIterations: options.maxIterations ?? 25,
  failures: 0,
  maxFailures: options.maxFailures ?? 3,
});

export const toStatusSnapshot = (state: OttoCoreState): OttoStatusSnapshot => ({
  runId: state.runId,
  phase: state.phase,
  stopCode: state.stopCode,
  stopReason: state.stopReason,
  sessionPolicy: state.sessionPolicy,
  sessionSupport: state.sessionSupport,
  lastSessionRotation: state.lastSessionRotation,
});
