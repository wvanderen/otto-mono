import type { Model } from "@mariozechner/pi-coding-agent";
import {
  SessionManager,
  createAgentSession,
} from "@mariozechner/pi-coding-agent";

import type {
  OttoSessionFilter,
  OttoSessionHandle,
  OttoSessionInfo,
  OttoSessionOptions,
  OttoSessionRuntime,
} from "../core/contracts";

export interface SdkOttoSessionRuntimeOptions {
  cwd: string;
  sessionDir?: string;
  model?: Model<any>;
}

export class SdkOttoSessionRuntime implements OttoSessionRuntime {
  constructor(private readonly options: SdkOttoSessionRuntimeOptions) {}

  async createRunSession(
    options: OttoSessionOptions = {},
  ): Promise<OttoSessionHandle> {
    const manager = SessionManager.create(
      options.cwd ?? this.options.cwd,
      this.options.sessionDir,
    );
    const { session } = await createAgentSession({
      cwd: options.cwd ?? this.options.cwd,
      model: this.options.model,
      sessionManager: manager,
    });
    return {
      sessionId: session.sessionId,
      sessionPath: session.sessionFile ?? null,
      runId: options.runId ?? null,
      policy: options.policy ?? "require-fresh",
      support: "supported",
    };
  }

  async continueRunSession(runId: string): Promise<OttoSessionHandle> {
    const manager = SessionManager.continueRecent(
      this.options.cwd,
      this.options.sessionDir,
    );
    const { session } = await createAgentSession({
      cwd: this.options.cwd,
      model: this.options.model,
      sessionManager: manager,
    });
    return {
      sessionId: session.sessionId,
      sessionPath: session.sessionFile ?? null,
      runId,
      policy: "require-fresh",
      support: "supported",
    };
  }

  async openSession(sessionIdOrPath: string): Promise<OttoSessionHandle> {
    const sessions = await SessionManager.list(
      this.options.cwd,
      this.options.sessionDir,
    );
    const match = sessions.find(
      (session) =>
        session.path === sessionIdOrPath || session.id === sessionIdOrPath,
    );
    const path = match?.path ?? sessionIdOrPath;
    const manager = SessionManager.open(path, this.options.sessionDir);
    const { session } = await createAgentSession({
      cwd: this.options.cwd,
      model: this.options.model,
      sessionManager: manager,
    });
    return {
      sessionId: session.sessionId,
      sessionPath: session.sessionFile ?? null,
      runId: null,
      policy: "require-fresh",
      support: "supported",
    };
  }

  async listSessions(
    filter: OttoSessionFilter = {},
  ): Promise<OttoSessionInfo[]> {
    const sessions = await SessionManager.list(
      this.options.cwd,
      this.options.sessionDir,
    );
    const mapped = sessions.map((session) => ({
      sessionId: session.id,
      sessionPath: session.path,
      runId: filter.runId ?? null,
      createdAt: session.created,
      updatedAt: session.modified,
      summary: session.firstMessage || null,
    }));
    return filter.limit ? mapped.slice(0, filter.limit) : mapped;
  }

  async rotateSession(handle: OttoSessionHandle): Promise<OttoSessionHandle> {
    return this.createRunSession({
      cwd: this.options.cwd,
      policy: handle.policy,
      runId: handle.runId ?? undefined,
    });
  }
}
