import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  ExecResult,
  OttoCommandExecutor,
  OttoQueueWorkflowOptions,
} from "../core";

export class PiCommandExecutor implements OttoCommandExecutor {
  constructor(private readonly pi: ExtensionAPI) {}

  async queueWorkflowCommand(
    command: string,
    prompt: string,
    options: OttoQueueWorkflowOptions = {},
  ): Promise<void> {
    this.pi.sendUserMessage(
      `${command}\n\n${prompt}`,
      options.followUp ? { deliverAs: "followUp" } : undefined,
    );
  }

  async executeShell(
    command: string,
    args: string[],
    timeout?: number,
  ): Promise<ExecResult> {
    const result = await this.pi.exec(command, args, { timeout });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? 0,
    };
  }
}
