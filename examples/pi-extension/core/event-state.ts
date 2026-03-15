import type { OttoCoreState } from "./state";

export const startOttoTurn = (): boolean => false;

export const registerOttoToolError = (
  state: OttoCoreState,
  toolName: string,
): { state: OttoCoreState; turnHadToolError: boolean } => ({
  state: {
    ...state,
    lastError: `Tool ${toolName} failed`,
  },
  turnHadToolError: true,
});

export const markAwaitingWorkflowStarted = (
  state: OttoCoreState,
  now = Date.now(),
): OttoCoreState => ({
  ...state,
  awaitingStarted: true,
  lastProgressAt: now,
});

export const completeAwaitingWorkflowStart = (
  state: OttoCoreState,
): {
  state: OttoCoreState;
  completedCommand: string | null;
  completedToken: string | null;
} => ({
  state: {
    ...state,
    awaitingStarted: false,
  },
  completedCommand: state.awaitingCommand,
  completedToken: state.awaitingToken,
});

export const shouldIgnoreAgentEnd = (state: OttoCoreState): boolean =>
  !state.active ||
  state.phase === "paused" ||
  state.phase === "stopped" ||
  state.phase === "completed" ||
  state.phase === "error" ||
  !state.awaitingCommand ||
  !state.awaitingStarted;
