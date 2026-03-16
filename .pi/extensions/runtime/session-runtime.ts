import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

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
  metadataDir?: string;
  model?: Model<any>;
  sessionManager?: SessionManager;
}

interface OttoSessionRecord {
  sessionId: string;
  sessionPath: string;
  runId: string | null;
  policy: OttoSessionHandle["policy"];
  support: OttoSessionHandle["support"];
  createdAt: string;
  updatedAt: string;
}

interface OttoSessionIndex {
  version: 1;
  sessions: OttoSessionRecord[];
}

export class SdkOttoSessionRuntime implements OttoSessionRuntime {
  constructor(private readonly options: SdkOttoSessionRuntimeOptions) {}

  private isWithinSessionDir(path: string, cwd = this.options.cwd): boolean {
    const sessionDir = resolve(this.getSessionDir(cwd));
    const candidate = resolve(path);
    const relativePath = relative(sessionDir, candidate);

    return (
      relativePath === "" ||
      (!relativePath.startsWith("..") && !relativePath.startsWith("../"))
    );
  }

  private getRuntimeSessionManager(
    cwd = this.options.cwd,
  ): SessionManager | undefined {
    if (!this.options.sessionManager) return undefined;

    const currentPath = this.options.sessionManager.getSessionFile?.() ?? null;
    if (!currentPath) return this.options.sessionManager;

    return this.isWithinSessionDir(currentPath, cwd)
      ? this.options.sessionManager
      : undefined;
  }

  private getSessionDir(cwd = this.options.cwd): string {
    return this.options.sessionDir ?? resolve(cwd, ".pi/otto/sessions");
  }

  private getMetadataDir(cwd = this.options.cwd): string {
    return this.options.metadataDir ?? resolve(cwd, ".pi/otto/runtime");
  }

  private getIndexPath(cwd = this.options.cwd): string {
    return join(this.getMetadataDir(cwd), "sessions.json");
  }

  private ensureRuntimeDirs(cwd = this.options.cwd): void {
    mkdirSync(this.getSessionDir(cwd), { recursive: true });
    mkdirSync(this.getMetadataDir(cwd), { recursive: true });
  }

  private readIndex(cwd = this.options.cwd): OttoSessionIndex {
    const path = this.getIndexPath(cwd);
    if (!existsSync(path)) return { version: 1, sessions: [] };

    try {
      return JSON.parse(readFileSync(path, "utf8")) as OttoSessionIndex;
    } catch {
      return { version: 1, sessions: [] };
    }
  }

  private writeIndex(index: OttoSessionIndex, cwd = this.options.cwd): void {
    this.ensureRuntimeDirs(cwd);
    writeFileSync(this.getIndexPath(cwd), JSON.stringify(index, null, 2));
  }

  private toHandle(
    sessionId: string,
    sessionPath: string | null,
    runId: string | null,
    policy: OttoSessionHandle["policy"],
    support: OttoSessionHandle["support"],
    cwd = this.options.cwd,
  ): OttoSessionHandle {
    return {
      sessionId,
      sessionPath,
      runId,
      policy,
      support,
      metadataPath: this.getIndexPath(cwd),
    };
  }

  private persistSessionRecord(
    handle: OttoSessionHandle,
    cwd = this.options.cwd,
  ): void {
    if (!handle.sessionPath) return;

    const index = this.readIndex(cwd);
    const now = new Date().toISOString();
    const existing = index.sessions.findIndex(
      (session) => session.sessionPath === handle.sessionPath,
    );
    const record: OttoSessionRecord = {
      sessionId: handle.sessionId,
      sessionPath: handle.sessionPath,
      runId: handle.runId,
      policy: handle.policy,
      support: handle.support,
      createdAt: existing >= 0 ? index.sessions[existing].createdAt : now,
      updatedAt: now,
    };

    if (existing >= 0) index.sessions[existing] = record;
    else index.sessions.push(record);

    this.writeIndex(index, cwd);
  }

  async createRunSession(
    options: OttoSessionOptions = {},
  ): Promise<OttoSessionHandle> {
    const cwd = options.cwd ?? this.options.cwd;
    const policy = options.policy ?? "require-fresh";

    this.ensureRuntimeDirs(cwd);
    const manager = SessionManager.create(cwd, this.getSessionDir(cwd));
    const { session } = await createAgentSession({
      cwd,
      model: this.options.model,
      sessionManager: manager,
    });

    if (options.runId) {
      manager.appendCustomEntry("otto-run", {
        runId: options.runId,
        policy,
      });
      manager.appendSessionInfo(`Otto ${options.runId}`);
    }

    const handle = this.toHandle(
      session.sessionId,
      session.sessionFile ?? null,
      options.runId ?? null,
      policy,
      "supported",
      cwd,
    );
    this.persistSessionRecord(handle, cwd);
    return handle;
  }

  async continueRunSession(runId: string): Promise<OttoSessionHandle | null> {
    const index = this.readIndex();
    const previous = index.sessions
      .filter((session) => session.runId === runId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

    if (!previous) return null;

    return this.toHandle(
      previous.sessionId,
      previous.sessionPath,
      previous.runId,
      previous.policy,
      previous.support,
    );
  }

  async openSession(sessionIdOrPath: string): Promise<OttoSessionHandle> {
    const sessions = await SessionManager.list(
      this.options.cwd,
      this.getSessionDir(),
    );
    const match = sessions.find(
      (session) =>
        session.path === sessionIdOrPath || session.id === sessionIdOrPath,
    );
    const path = match?.path ?? sessionIdOrPath;
    const record = this.readIndex().sessions.find(
      (session) => session.sessionPath === path,
    );
    const manager = SessionManager.open(path, this.getSessionDir());
    const { session } = await createAgentSession({
      cwd: this.options.cwd,
      model: this.options.model,
      sessionManager: manager,
    });

    const handle = this.toHandle(
      session.sessionId,
      session.sessionFile ?? null,
      record?.runId ?? null,
      record?.policy ?? "require-fresh",
      record?.support ?? "supported",
    );
    this.persistSessionRecord(handle);
    return handle;
  }

  async listSessions(
    filter: OttoSessionFilter = {},
  ): Promise<OttoSessionInfo[]> {
    const sessions = await SessionManager.list(
      this.options.cwd,
      this.getSessionDir(),
    );
    const index = this.readIndex();
    const mapped = sessions.map((session) => {
      const record = index.sessions.find(
        (item) => item.sessionPath === session.path,
      );
      return {
        sessionId: session.id,
        sessionPath: session.path,
        runId: record?.runId ?? null,
        createdAt: session.created,
        updatedAt: session.modified,
        summary: session.firstMessage || null,
        policy: record?.policy ?? "require-fresh",
        support: record?.support ?? "supported",
        metadataPath: this.getIndexPath(),
      };
    });

    const filtered = filter.runId
      ? mapped.filter((session) => session.runId === filter.runId)
      : mapped;
    const sorted = [...filtered].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );

    return filter.limit ? sorted.slice(0, filter.limit) : sorted;
  }

  async recordSession(handle: OttoSessionHandle): Promise<OttoSessionHandle> {
    const recorded = this.toHandle(
      handle.sessionId,
      handle.sessionPath,
      handle.runId,
      handle.policy,
      handle.support,
    );
    this.persistSessionRecord(recorded);
    return recorded;
  }

  async getCurrentSessionHandle(
    options: OttoSessionOptions = {},
  ): Promise<OttoSessionHandle> {
    const cwd = options.cwd ?? this.options.cwd;
    const policy = options.policy ?? "require-fresh";
    const manager = this.getRuntimeSessionManager(cwd);

    if (!manager) {
      return this.recordSession({
        sessionId: "unknown",
        sessionPath: null,
        runId: options.runId ?? null,
        policy,
        support: "unavailable",
        metadataPath: this.getIndexPath(cwd),
      });
    }

    const handle = this.toHandle(
      manager.getSessionId(),
      manager.getSessionFile() ?? null,
      options.runId ?? null,
      policy,
      "supported",
      cwd,
    );
    this.persistSessionRecord(handle, cwd);
    return handle;
  }

  async rotateSession(handle: OttoSessionHandle): Promise<OttoSessionHandle> {
    return this.createRunSession({
      cwd: this.options.cwd,
      policy: handle.policy,
      runId: handle.runId ?? undefined,
    });
  }
}
