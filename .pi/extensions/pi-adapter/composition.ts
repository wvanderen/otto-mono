import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";

import { OttoCoreService } from "../core";
import { SdkOttoSessionRuntime } from "../runtime";
import { PiCommandExecutor } from "./commands";
import { PiOperatorUi } from "./ui";

export interface OttoPiServices {
  core: OttoCoreService;
  commands: PiCommandExecutor;
  sessions: SdkOttoSessionRuntime;
  ui: PiOperatorUi;
}

export const createOttoPiServices = (
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): OttoPiServices => {
  const commands = new PiCommandExecutor(pi);
  const sessions = new SdkOttoSessionRuntime({ cwd: process.cwd() });
  const ui = new PiOperatorUi(ctx);
  const core = new OttoCoreService({ commands, sessions, ui });

  return { core, commands, sessions, ui };
};

export const createOttoPiCore = (
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): OttoCoreService => createOttoPiServices(pi, ctx).core;
