import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import type {
  OttoCompactionRequest,
  OttoSessionController,
  OttoSessionRotationResult,
} from "../core";

export class PiSessionController implements OttoSessionController {
  constructor(private readonly ctx: ExtensionContext) {}

  async rotate(): Promise<OttoSessionRotationResult> {
    const maybeNewSession = (
      this.ctx as ExtensionContext & {
        newSession?: () => Promise<{ cancelled?: boolean }>;
      }
    ).newSession;

    if (typeof maybeNewSession !== "function") {
      return { status: "unsupported" };
    }

    try {
      const result = await maybeNewSession.call(this.ctx);
      return { status: result.cancelled ? "cancelled" : "success" };
    } catch {
      return { status: "failed" };
    }
  }

  compact(request: OttoCompactionRequest): void {
    this.ctx.compact({
      customInstructions: request.customInstructions,
      onComplete: request.onComplete,
      onError: request.onError,
    });
  }
}
