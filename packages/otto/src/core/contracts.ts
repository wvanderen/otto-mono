export type OttoSessionPolicy = "require-fresh" | "allow-compatibility";

export type OttoNotificationLevel = "info" | "warning" | "error" | "success";

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

export type OttoDriftPolicy = "validate" | "continue" | "pause";

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

export interface OttoQueueWorkflowOptions {
  followUp?: boolean;
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

// Core orchestration depends on session lifecycle through this runtime contract
// so the Otto engine can stay package-owned while adapters translate SDK quirks.
export interface OttoSessionRuntime {
  createRunSession(options?: OttoSessionOptions): Promise<OttoSessionHandle>;
  continueRunSession(runId: string): Promise<OttoSessionHandle>;
  openSession(sessionIdOrPath: string): Promise<OttoSessionHandle>;
  listSessions(filter?: OttoSessionFilter): Promise<OttoSessionInfo[]>;
  rotateSession(handle: OttoSessionHandle): Promise<OttoSessionHandle>;
}

// Workflow dispatch belongs to the boundary so Otto can drive Pi today and a
// future headless/CLI surface later without changing run logic.
export interface OttoCommandExecutor {
  queueWorkflowCommand(
    command: string,
    prompt: string,
    options?: OttoQueueWorkflowOptions,
  ): Promise<void>;
  executeShell(
    command: string,
    args: string[],
    timeout?: number,
  ): Promise<ExecResult>;
}

// Operator interaction is adapter-owned; the core emits snapshots and messages.
export interface OttoOperatorUi {
  notify(message: string, level: OttoNotificationLevel): void;
  isInteractive(): boolean;
  choose<T>(
    title: string,
    options: Array<{ label: string; value: T }>,
  ): Promise<T | null>;
  select(title: string, options: string[]): Promise<string | null>;
  renderStatus(snapshot: OttoStatusSnapshot): void;
}

export type OttoSessionControlStatus =
  | "success"
  | "cancelled"
  | "unsupported"
  | "failed";

export interface OttoSessionRotationResult {
  status: OttoSessionControlStatus;
}

export interface OttoCompactionRequest {
  customInstructions: string;
  onComplete: () => void;
  onError: () => void;
}

// Fresh-session rotation and compaction stay adapter-owned because they are
// interactive runtime affordances rather than Otto policy decisions.
export interface OttoSessionController {
  rotate(): Promise<OttoSessionRotationResult>;
  compact(request: OttoCompactionRequest): void;
}
