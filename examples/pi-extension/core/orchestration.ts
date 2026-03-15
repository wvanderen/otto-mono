import type { OttoSessionPolicy } from "./contracts";

export const OTTO_COMPACTION_INSTRUCTIONS =
  "Preserve only concise Otto continuity: current run phase, latest td issue/action, validation status, unresolved blockers, and immediate next-step context.";

export const resolveOttoSessionPolicy = (
  freshSessionBetweenSteps: boolean,
): OttoSessionPolicy =>
  freshSessionBetweenSteps ? "require-fresh" : "allow-compatibility";

export const resolveOttoStartReason = (skipInit: boolean): string =>
  skipInit
    ? "Skip initialize and begin directly with next-step based on existing workspace state."
    : "Start by initializing BMAD and td context before entering the next-step loop.";

export const freshSessionContinueReason = (): string =>
  "Fresh session created successfully via Pi's native new-session flow; continue with the next-step workflow.";

export const compactedContinueReason = (): string =>
  "Compaction completed; continue the loop in the current session.";

export const compactionFallbackReason = (): string =>
  "Compaction fallback triggered; continue the loop without a fresh session.";

export const resumeNextStepReason = (): string =>
  "Resume the loop from a paused state and continue with the next-step workflow.";

export const freshSessionUnsupportedWarning = (): string =>
  "Pi new-session API is unavailable; falling back to same-session compacted iteration.";

export const freshSessionFailedWarning = (): string =>
  "Fresh-session rotation failed; falling back to same-session compacted iteration.";
