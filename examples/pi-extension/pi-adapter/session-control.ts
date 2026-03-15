import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

export interface PiSessionRotationResult {
  status: "success" | "cancelled" | "unsupported" | "failed";
}

export interface PiCompactionOptions {
  customInstructions: string;
  onComplete: () => void;
  onError: () => void;
}

export class PiSessionController {
  async rotate(ctx: ExtensionContext): Promise<PiSessionRotationResult> {
    const maybeNewSession = (
      ctx as ExtensionContext & {
        newSession?: () => Promise<{ cancelled?: boolean }>;
      }
    ).newSession;

    if (typeof maybeNewSession !== "function") {
      return { status: "unsupported" };
    }

    try {
      const result = await maybeNewSession.call(ctx);
      return { status: result.cancelled ? "cancelled" : "success" };
    } catch {
      return { status: "failed" };
    }
  }

  compact(ctx: ExtensionContext, options: PiCompactionOptions): void {
    ctx.compact({
      customInstructions: options.customInstructions,
      onComplete: options.onComplete,
      onError: options.onError,
    });
  }
}
