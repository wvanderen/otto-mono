export type OttoSessionPolicy = "require-fresh" | "allow-compatibility";

export type OttoSessionSupport =
  | "unknown"
  | "supported"
  | "unavailable"
  | "failed";

export type OttoSessionRotationOutcome =
  | "not-attempted"
  | "success"
  | "cancelled"
  | "failed";

export type OttoWorkflowMode = "accept-default" | "party";

export type OttoOperatingMode = "delivery" | "explore" | "custom";

export type OttoActionKind =
  | "review"
  | "implementation"
  | "requirements-validation"
  | "epic-workflow"
  | "unknown";

export type OttoOutcomeKind =
  | "completed"
  | "blocked"
  | "needs-input"
  | "no-work"
  | "failed"
  | "unknown";

export type OttoConfidenceKind = "high" | "medium" | "low" | "unknown";

export type OttoContinuityKind =
  | "none"
  | "fresh-session"
  | "same-session-compacted"
  | "compaction-fallback";

export type OttoResultSourceKind =
  | "structured"
  | "heuristic"
  | "malformed"
  | "mismatched"
  | null;

export type OttoQueueState =
  | "unknown"
  | "ready"
  | "in-review-only"
  | "drained-first-pass"
  | "drained-ready-for-validation"
  | "drained-final";

export type OttoPhase =
  | "idle"
  | "initializing"
  | "running"
  | "paused"
  | "stopped"
  | "completed"
  | "error";

export type OttoStopCode =
  | "none"
  | "manual-stop"
  | "paused-for-input"
  | "blocked-workflow"
  | "session-rotation-unsupported"
  | "session-rotation-cancelled"
  | "session-rotation-failed"
  | "failure-budget-reached"
  | "max-iterations-reached"
  | "queue-drained"
  | "queue-drained-in-review-only"
  | "validate-prd-finished"
  | "validate-prd-in-review-only";

export interface OttoSessionHandle {
  sessionId: string;
  sessionPath: string | null;
  runId: string | null;
  policy: OttoSessionPolicy;
  support: OttoSessionSupport;
  metadataPath: string | null;
}

export interface OttoSessionInfo {
  sessionId: string;
  sessionPath: string;
  runId: string | null;
  createdAt: string;
  updatedAt: string;
  summary: string | null;
  policy: OttoSessionPolicy;
  support: OttoSessionSupport;
  metadataPath: string | null;
}

export interface OttoSessionFilter {
  runId?: string;
  limit?: number;
}

export interface OttoSessionOptions {
  runId?: string;
  policy?: OttoSessionPolicy;
  cwd?: string;
}

export interface OttoStatusSnapshot {
  runId: string | null;
  phase: OttoPhase;
  stopCode: OttoStopCode;
  stopReason: string | null;
  sessionPolicy: OttoSessionPolicy;
  sessionSupport: OttoSessionSupport;
  lastSessionRotation: OttoSessionRotationOutcome;
  queueState: OttoQueueState;
  iteration: number;
  failures: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface OttoSessionRuntime {
  createRunSession(options?: OttoSessionOptions): Promise<OttoSessionHandle>;
  continueRunSession(runId: string): Promise<OttoSessionHandle>;
  openSession(sessionIdOrPath: string): Promise<OttoSessionHandle>;
  listSessions(filter?: OttoSessionFilter): Promise<OttoSessionInfo[]>;
  rotateSession(handle: OttoSessionHandle): Promise<OttoSessionHandle>;
}

export interface OttoCommandExecutor {
  queueWorkflowCommand(command: string, prompt: string): Promise<void>;
  executeShell(
    command: string,
    args: string[],
    timeout?: number,
  ): Promise<ExecResult>;
}

export interface OttoOperatorUi {
  notify(
    message: string,
    level: "info" | "warning" | "error" | "success",
  ): void;
  choose<T>(
    title: string,
    options: Array<{ label: string; value: T }>,
  ): Promise<T | null>;
  renderStatus(snapshot: OttoStatusSnapshot): void;
}
