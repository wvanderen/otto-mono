import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import type { OttoOperatorUi, OttoStatusSnapshot } from "../core";

export class PiOperatorUi implements OttoOperatorUi {
  constructor(private readonly ctx: ExtensionCommandContext) {}

  notify(
    message: string,
    level: "info" | "warning" | "error" | "success",
  ): void {
    if (!this.ctx.hasUI) return;
    this.ctx.ui.notify(message, level);
  }

  async choose<T>(
    _title: string,
    _options: Array<{ label: string; value: T }>,
  ): Promise<T | null> {
    return null;
  }

  renderStatus(snapshot: OttoStatusSnapshot): void {
    if (!this.ctx.hasUI) return;
    this.ctx.ui.notify(
      [
        `Run: ${snapshot.runId ?? "none"}`,
        `Phase: ${snapshot.phase}`,
        `Stop code: ${snapshot.stopCode}`,
        `Session policy: ${snapshot.sessionPolicy}`,
        `Session support: ${snapshot.sessionSupport}`,
        `Rotation: ${snapshot.lastSessionRotation}`,
        `Queue: ${snapshot.queueState}`,
        `Iteration: ${snapshot.iteration}`,
        `Failures: ${snapshot.failures}`,
      ].join("\n"),
      "info",
    );
  }
}
