import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import { OttoCoreService, type OttoSessionController } from "../core";
import { SdkOttoSessionRuntime } from "../runtime";
import { PiCommandExecutor } from "./commands";
import { PiSessionController } from "./session-control";
import { PiOperatorUi } from "./ui";

export interface OttoPiServices {
  core: OttoCoreService;
  commands: PiCommandExecutor;
  sessions: SdkOttoSessionRuntime;
  sessionControl: OttoSessionController;
  ui: PiOperatorUi;
}

export const createOttoPiServices = (
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): OttoPiServices => {
  const commands = new PiCommandExecutor(pi);
  const sessions = new SdkOttoSessionRuntime({
    cwd: process.cwd(),
    sessionManager: ctx.sessionManager,
  });
  const sessionControl = new PiSessionController(ctx);
  const ui = new PiOperatorUi(ctx);
  const core = new OttoCoreService({ commands, sessions, ui });

  return { core, commands, sessions, sessionControl, ui };
};

export const createOttoPiCore = (
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): OttoCoreService => createOttoPiServices(pi, ctx).core;

export const createCachedOttoPiServices = (pi: ExtensionAPI) => {
  const cache = new WeakMap<object, OttoPiServices>();

  return (ctx: ExtensionContext | ExtensionCommandContext): OttoPiServices => {
    const key = ctx as object;
    const cached = cache.get(key);
    if (cached) return cached;
    const created = createOttoPiServices(pi, ctx as ExtensionCommandContext);
    cache.set(key, created);
    return created;
  };
};
