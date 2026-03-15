import {
  createOttoCoreState,
  toStatusSnapshot,
  type OttoCoreState,
} from "./state";
import type {
  OttoCommandExecutor,
  OttoOperatorUi,
  OttoSessionPolicy,
  OttoSessionRuntime,
  OttoStatusSnapshot,
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
}
