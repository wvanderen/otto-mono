import {
  clearOttoAwaitingState,
  queueOttoCommandState,
  registerOttoFailure,
  stopOttoState,
  type OttoCoreState,
} from "./state";
import type {
  OttoDriftPolicy,
  OttoOperatingMode,
  OttoPhase,
  OttoQueueState,
  OttoStopCode,
  OttoWorkflowMode,
} from "./contracts";

export interface OttoQueuedWorkflowInput {
  command: string;
  prompt: string;
  token: string;
  reason: string;
  commandMode: OttoWorkflowMode;
  autonomyMode: OttoOperatingMode;
  policySummary: string;
}

export const applyQueuedWorkflow = (
  state: OttoCoreState,
  input: OttoQueuedWorkflowInput,
): OttoCoreState =>
  queueOttoCommandState(state, {
    command: input.command,
    prompt: input.prompt,
    token: input.token,
    reason: input.reason,
    commandMode: input.commandMode,
    autonomyMode: input.autonomyMode,
    policySummary: input.policySummary,
  });

export const prepareFreshSessionHop = (
  state: OttoCoreState,
  continuationReason: string,
): OttoCoreState => ({
  ...clearOttoAwaitingState(state),
  lastCommandMode: "accept-default",
  lastDecisionReason: continuationReason,
});

export const prepareCompaction = (state: OttoCoreState): OttoCoreState =>
  clearOttoAwaitingState(state);

export const applyStopState = (
  state: OttoCoreState,
  phase: OttoPhase,
  reason: string,
  stopCode: OttoStopCode,
): OttoCoreState => stopOttoState(state, phase, reason, stopCode);

export const applyFailureState = (
  state: OttoCoreState,
  message: string,
): OttoCoreState => registerOttoFailure(state, message);

export interface OttoRemainingWork {
  hasImmediateWork: boolean;
  hasInReview: boolean;
}

export const parseOttoRemainingWork = (
  reviewableOutput: string,
  readyOutput: string,
  inReviewOutput: string,
): OttoRemainingWork => {
  const immediateOutput = `${reviewableOutput}\n${readyOutput}`;
  return {
    hasImmediateWork: /\btd-[a-z0-9]+\b/i.test(immediateOutput),
    hasInReview: /\btd-[a-z0-9]+\b/i.test(inReviewOutput),
  };
};

export const mergeOttoEvidenceSignals = (
  current: string[],
  additions: string[],
): string[] => [...new Set([...current, ...additions])];

export const resolveOttoQueueStateFromWork = (
  state: OttoCoreState,
  remainingWork: OttoRemainingWork,
): OttoQueueState => {
  if (remainingWork.hasImmediateWork) return "ready";
  if (remainingWork.hasInReview) return "in-review-only";
  return state.emptyQueuePasses >= 1
    ? "drained-ready-for-validation"
    : "drained-first-pass";
};

export const buildOttoTdDriftReason = (
  remainingWork: OttoRemainingWork,
): string =>
  remainingWork.hasImmediateWork
    ? "Workflow reported no-work, but td still has ready or reviewable issues."
    : "Workflow reported no-work, but td still has in-review issues.";

export type OttoTdDriftAction = "continue" | "pause" | "validate";

export interface OttoTdDriftActionInput {
  driftPolicy: OttoDriftPolicy;
  completedCommand: string;
  validatePrdCommand: string;
}

export const resolveOttoTdDriftAction = (
  input: OttoTdDriftActionInput,
): OttoTdDriftAction => {
  if (input.completedCommand === input.validatePrdCommand) return "continue";
  if (input.driftPolicy === "pause") return "pause";
  if (input.driftPolicy === "validate") return "validate";
  return "continue";
};

export const buildFailureBudgetReason = (
  message: string,
  failures: number,
  maxFailures: number,
): string => `${message} Failure budget reached (${failures}/${maxFailures}).`;

export const buildStopNotification = (
  phase: OttoPhase,
  reason: string,
): { message: string; level: "info" | "error" } => ({
  message: `Otto ${phase}: ${reason}`,
  level: phase === "error" ? "error" : "info",
});

export const applyInitCompletion = (state: OttoCoreState): OttoCoreState => ({
  ...state,
  emptyQueuePasses: 0,
  queueState: "ready",
  phase: "running",
  lastError: null,
  stopCode: "none",
});

export const advanceOttoIteration = (state: OttoCoreState): OttoCoreState => ({
  ...state,
  iteration: state.iteration + 1,
});

export const updateOttoQueueState = (
  state: OttoCoreState,
  queueState: OttoQueueState,
): OttoCoreState => ({
  ...state,
  queueState,
});

export const setOttoEmptyQueuePasses = (
  state: OttoCoreState,
  emptyQueuePasses: number,
): OttoCoreState => ({
  ...state,
  emptyQueuePasses,
});

export const resetOttoQueueProgress = (
  state: OttoCoreState,
): OttoCoreState => ({
  ...state,
  emptyQueuePasses: 0,
  queueState: "ready",
});

export type OttoQueueDrainAction =
  | {
      kind: "continue-next-step";
      persistReason: string;
    }
  | {
      kind: "queue-validate-prd";
      persistReason: string;
      prompt: string;
    }
  | {
      kind: "stop-completed";
      phase: "completed";
      reason: string;
      stopCode: OttoStopCode;
    };

export interface OttoQueueDrainDecision {
  state: OttoCoreState;
  action: OttoQueueDrainAction;
}

export interface OttoQueueDrainDecisionInput {
  state: OttoCoreState;
  completedCommand: string;
  nextStepCommand: string;
  validatePrdCommand: string;
  hasInReview: boolean;
  shouldValidate: boolean;
  evidenceSignals: string[];
}

export const resolveOttoQueueDrainDecision = (
  input: OttoQueueDrainDecisionInput,
): OttoQueueDrainDecision => {
  if (input.hasInReview && input.state.freshSessionBetweenSteps) {
    const state = updateOttoQueueState(
      setOttoEmptyQueuePasses(input.state, 0),
      "in-review-only",
    );
    return {
      state,
      action: {
        kind: "continue-next-step",
        persistReason: "loop-continue-in-review-session-hop",
      },
    };
  }

  let state = setOttoEmptyQueuePasses(
    input.state,
    input.state.emptyQueuePasses + 1,
  );

  if (
    input.shouldValidate &&
    input.completedCommand !== input.validatePrdCommand
  ) {
    state = updateOttoQueueState(state, "drained-ready-for-validation");
    return {
      state,
      action: {
        kind: "queue-validate-prd",
        persistReason: "loop-run-validate-prd-evidence-gap",
        prompt: `Completion evidence was weak (${input.evidenceSignals.join(", ")}); validate against the PRD before stopping.`,
      },
    };
  }

  if (input.completedCommand === input.validatePrdCommand) {
    state = updateOttoQueueState(
      state,
      input.hasInReview ? "in-review-only" : "drained-final",
    );
    return {
      state,
      action: {
        kind: "stop-completed",
        phase: "completed",
        reason: input.hasInReview
          ? "Only in-review issues remain after PRD validation and session hopping is disabled."
          : "No reviewable, ready, epic-maintenance, or PRD gap work remains.",
        stopCode: input.hasInReview
          ? "validate-prd-in-review-only"
          : "validate-prd-finished",
      },
    };
  }

  if (
    state.emptyQueuePasses === 1 ||
    (input.completedCommand === input.nextStepCommand &&
      state.lastAction === "epic-workflow")
  ) {
    state = updateOttoQueueState(state, "drained-first-pass");
    return {
      state,
      action: {
        kind: "continue-next-step",
        persistReason: "loop-continue-drained-queue-sweep",
      },
    };
  }

  state = updateOttoQueueState(state, "drained-ready-for-validation");
  return {
    state,
    action: {
      kind: "queue-validate-prd",
      persistReason: "loop-run-validate-prd",
      prompt:
        "Ready/reviewable work is drained; validate against the PRD and reopen any real gaps.",
    },
  };
};
