import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";

import { OttoCoreService } from "../core";
import { SdkOttoSessionRuntime } from "../runtime";
import { PiCommandExecutor } from "./commands";
import { PiSessionController } from "./session-control";
import { PiOperatorUi } from "./ui";

export interface OttoPiServices {
  core: OttoCoreService;
  commands: PiCommandExecutor;
  sessions: SdkOttoSessionRuntime;
  sessionControl: PiSessionController;
  ui: PiOperatorUi;
}

export const createOttoPiServices = (
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): OttoPiServices => {
  const commands = new PiCommandExecutor(pi);
  const sessions = new SdkOttoSessionRuntime({ cwd: process.cwd() });
  const sessionControl = new PiSessionController();
  const ui = new PiOperatorUi(ctx);
  const core = new OttoCoreService({ commands, sessions, ui });

  return { core, commands, sessions, sessionControl, ui };
};

export const createOttoPiCore = (
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): OttoCoreService => createOttoPiServices(pi, ctx).core;
