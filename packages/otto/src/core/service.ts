import {
  clearOttoAwaitingState,
  createOttoCoreState,
  initializeOttoRunState,
  pauseOttoRunState,
  registerOttoFailure,
  resumeOttoRunState,
  stopOttoState,
  toStatusSnapshot,
  type OttoCoreState,
} from "./state";
import type {
  OttoCommandExecutor,
  OttoOperatorUi,
  OttoPhase,
  OttoQueueState,
  OttoSessionPolicy,
  OttoSessionRuntime,
  OttoStatusSnapshot,
  OttoStopCode,
} from "./contracts";

export interface OttoCoreDependencies {
  commands: OttoCommandExecutor;
  sessions: OttoSessionRuntime;
  ui: OttoOperatorUi;
}

export interface OttoStartOptions {
  runId?: string;
  sessionPolicy?: OttoSessionPolicy;
  maxIterations?: number;
  maxFailures?: number;
}

export interface OttoInitializeRunOptions {
  runId: string;
  phase: OttoPhase;
  maxIterations: number;
  maxFailures: number;
  freshSessionBetweenSteps: boolean;
  awaitingCommand: string;
  queueState: OttoQueueState;
}

export class OttoCoreService {
  private state: OttoCoreState;

  constructor(private readonly deps: OttoCoreDependencies) {
    this.state = createOttoCoreState();
  }

  getState(): OttoCoreState {
    return this.state;
  }

  getStatusSnapshot(): OttoStatusSnapshot {
    return toStatusSnapshot(this.state);
  }

  async start(options: OttoStartOptions = {}): Promise<OttoStatusSnapshot> {
    this.state = createOttoCoreState({
      runId: options.runId ?? this.state.runId,
      phase: "initializing",
      sessionPolicy: options.sessionPolicy ?? "require-fresh",
      maxIterations: options.maxIterations,
      maxFailures: options.maxFailures,
    });
    this.state.active = true;

    const session = await this.deps.sessions.createRunSession({
      runId: this.state.runId ?? undefined,
      policy: this.state.sessionPolicy,
    });

    this.state.runId = session.runId ?? this.state.runId;
    this.state.sessionSupport = session.support;
    this.state.lastSessionRotation = "success";
    this.state.phase = "running";
    this.deps.ui.renderStatus(this.getStatusSnapshot());
    return this.getStatusSnapshot();
  }

  initializeRun(options: OttoInitializeRunOptions): OttoCoreState {
    this.state = initializeOttoRunState(options);
    return this.state;
  }

  pause(): OttoCoreState {
    this.state = pauseOttoRunState(this.state);
    return this.state;
  }

  resume(awaitingCommand: string): OttoCoreState {
    this.state = resumeOttoRunState(this.state, awaitingCommand);
    return this.state;
  }

  stop(
    phase: OttoPhase,
    reason: string,
    stopCode: OttoStopCode,
  ): OttoCoreState {
    this.state = stopOttoState(this.state, phase, reason, stopCode);
    return this.state;
  }

  queueCleared(): OttoCoreState {
    this.state = clearOttoAwaitingState(this.state);
    return this.state;
  }

  registerFailure(message: string): OttoCoreState {
    this.state = registerOttoFailure(this.state, message);
    return this.state;
  }
}
