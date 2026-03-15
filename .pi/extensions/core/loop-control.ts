import {
  clearOttoAwaitingState,
  queueOttoCommandState,
  registerOttoFailure,
  stopOttoState,
  type OttoCoreState,
} from "./state";
import type {
  OttoOperatingMode,
  OttoPhase,
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
