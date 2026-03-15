import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";

import { OttoCoreService } from "../core";
import { SdkOttoSessionRuntime } from "../runtime";
import { PiCommandExecutor } from "./commands";
import { PiOperatorUi } from "./ui";

export const createOttoPiCore = (
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): OttoCoreService =>
  new OttoCoreService({
    commands: new PiCommandExecutor(pi),
    sessions: new SdkOttoSessionRuntime({ cwd: process.cwd() }),
    ui: new PiOperatorUi(ctx),
  });
