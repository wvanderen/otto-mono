import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import type {
  OttoNotificationLevel,
  OttoOperatorUi,
  OttoSessionSupport,
  OttoStatusSnapshot,
} from "../core";

const sessionSupportAlert = (support: OttoSessionSupport): string | null => {
  if (support === "unavailable") {
    return "Current Pi session is outside Otto-managed session storage.";
  }
  if (support === "failed") {
    return "Otto could not inspect or bind the current session runtime.";
  }
  return null;
};

export class PiOperatorUi implements OttoOperatorUi {
  constructor(private readonly ctx: ExtensionCommandContext) {}

  isInteractive(): boolean {
    return this.ctx.hasUI;
  }

  notify(message: string, level: OttoNotificationLevel): void {
    if (!this.ctx.hasUI) return;
    this.ctx.ui.notify(message, level);
  }

  async choose<T>(
    title: string,
    options: Array<{ label: string; value: T }>,
  ): Promise<T | null> {
    const selected = await this.select(
      title,
      options.map((option) => option.label),
    );
    if (!selected) return null;
    return options.find((option) => option.label === selected)?.value ?? null;
  }

  async select(title: string, options: string[]): Promise<string | null> {
    if (!this.ctx.hasUI) return null;
    return this.ctx.ui.select(title, options);
  }

  renderStatus(snapshot: OttoStatusSnapshot): void {
    if (!this.ctx.hasUI) return;
    const sessionAlert = sessionSupportAlert(snapshot.sessionSupport);
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
        ...(sessionAlert ? [`Session alert: ${sessionAlert}`] : []),
      ].join("\n"),
      "info",
    );
  }
}
