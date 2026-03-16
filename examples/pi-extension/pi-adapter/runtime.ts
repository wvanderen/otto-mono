import type {
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import {
  applyOttoSessionStatus,
  buildOttoStatusDetail,
  buildOttoStatusSnapshot,
  compactedContinueReason,
  compactionFallbackReason,
  freshSessionContinueReason,
  freshSessionFailedWarning,
  freshSessionUnsupportedWarning,
  OTTO_COMPACTION_INSTRUCTIONS,
  prepareCompaction,
  prepareFreshSessionHop,
  resumeOttoRunState,
  type OttoContinuityKind,
  type OttoCoreState,
  type OttoPhase,
  type OttoStopCode,
} from "../core";
import type { OttoPiServiceAccessor } from "./composition";

export interface OttoRuntimePreferenceInfo {
  source: string | null;
  error: string | null;
}

export interface OttoStatusRenderOptions {
  currentIssueLabel: string;
  reasonLabel: string;
  continuityLabel: string;
  alert: string | null;
  sessionAlert: string | null;
}

export interface OttoRuntimeControllerCallbacks {
  getState(): OttoCoreState;
  setState(state: OttoCoreState): void;
  persistState(reason: string): void;
  updateUi(ctx: ExtensionContext): void;
  stopRun(
    ctx: ExtensionContext,
    phase: OttoPhase,
    reason: string,
    stopCode: OttoStopCode,
  ): void;
  setContinuation(continuity: OttoContinuityKind, reason: string): void;
  queueWorkflowCommand(
    ctx: ExtensionContext,
    command: string,
    reason: string,
  ): void;
  loadPreferenceInfo(): OttoRuntimePreferenceInfo;
}

export class OttoPiRuntimeController {
  constructor(
    private readonly getServices: OttoPiServiceAccessor,
    private readonly callbacks: OttoRuntimeControllerCallbacks,
  ) {}

  async continueWithFreshSession(
    ctx: ExtensionContext,
    nextStepCommand: string,
  ): Promise<void> {
    const services = this.getServices(ctx);
    this.callbacks.setContinuation(
      "fresh-session",
      "Fresh-session mode is enabled; rotate the session before the next workflow step.",
    );

    const state = this.callbacks.getState();
    this.callbacks.setState(
      prepareFreshSessionHop(state, state.lastContinuationReason ?? ""),
    );
    this.callbacks.persistState("direct-session-hop-attempt");
    this.callbacks.updateUi(ctx);

    const rotation = await services.sessionControl.rotate();

    if (rotation.status === "unsupported") {
      services.ui.notify(freshSessionUnsupportedWarning(), "warning");
      this.compactAndQueueNextStep(ctx, nextStepCommand);
      return;
    }

    if (rotation.status === "cancelled") {
      this.callbacks.stopRun(
        ctx,
        "error",
        "Session rotation cancelled.",
        "session-rotation-cancelled",
      );
      return;
    }

    if (rotation.status === "success") {
      this.callbacks.persistState("session-rotated-direct");
      this.callbacks.updateUi(ctx);
      this.callbacks.queueWorkflowCommand(
        ctx,
        nextStepCommand,
        freshSessionContinueReason(),
      );
      return;
    }

    services.ui.notify(freshSessionFailedWarning(), "warning");
    this.compactAndQueueNextStep(ctx, nextStepCommand);
  }

  compactAndQueueNextStep(
    ctx: ExtensionContext,
    nextStepCommand: string,
  ): void {
    this.callbacks.setState(prepareCompaction(this.callbacks.getState()));
    this.callbacks.persistState("compact-before-next-step");
    this.callbacks.updateUi(ctx);

    this.getServices(ctx).sessionControl.compact({
      customInstructions: OTTO_COMPACTION_INSTRUCTIONS,
      onComplete: () => {
        const state = this.callbacks.getState();
        if (!state.active || state.phase !== "running") return;
        this.callbacks.setContinuation(
          "same-session-compacted",
          compactedContinueReason(),
        );
        this.callbacks.queueWorkflowCommand(
          ctx,
          nextStepCommand,
          compactedContinueReason(),
        );
      },
      onError: () => {
        const state = this.callbacks.getState();
        if (!state.active || state.phase !== "running") return;
        this.callbacks.setContinuation(
          "compaction-fallback",
          compactionFallbackReason(),
        );
        this.callbacks.queueWorkflowCommand(
          ctx,
          nextStepCommand,
          compactionFallbackReason(),
        );
      },
    });
  }

  queueNextStepIteration(ctx: ExtensionContext, nextStepCommand: string): void {
    if (this.callbacks.getState().freshSessionBetweenSteps) {
      void this.continueWithFreshSession(ctx, nextStepCommand);
      return;
    }
    this.compactAndQueueNextStep(ctx, nextStepCommand);
  }

  async start(args: {
    ctx: ExtensionCommandContext;
    sessionPolicy: string;
    initialCommand: string;
    skipInit: boolean;
  }): Promise<void> {
    const { ctx, sessionPolicy, initialCommand, skipInit } = args;
    const services = this.getServices(ctx);

    try {
      const session = await services.sessions.getCurrentSessionHandle({
        runId: this.callbacks.getState().runId ?? undefined,
        policy: sessionPolicy as "require-fresh" | "allow-compatibility",
      });
      this.callbacks.setState(
        applyOttoSessionStatus(this.callbacks.getState(), {
          sessionPolicy: session.policy,
          sessionSupport: session.support,
          lastSessionRotation: "not-attempted",
        }),
      );
      if (session.support === "unavailable") {
        services.ui.notify(
          "Otto attached to the current Pi session, but that session is outside Otto-managed session storage.",
          "warning",
        );
      }
    } catch (sessionError) {
      this.callbacks.setState(
        applyOttoSessionStatus(this.callbacks.getState(), {
          sessionPolicy: sessionPolicy as
            | "require-fresh"
            | "allow-compatibility",
          sessionSupport: "failed",
          lastSessionRotation: "failed",
          lastError:
            sessionError instanceof Error
              ? sessionError.message
              : String(sessionError),
        }),
      );
      services.ui.notify(
        `Otto session runtime setup failed: ${this.callbacks.getState().lastError}`,
        "warning",
      );
    }

    this.callbacks.persistState("start");
    this.callbacks.updateUi(ctx);
    this.callbacks.queueWorkflowCommand(
      ctx,
      initialCommand,
      skipInit
        ? "Operator requested next-step execution without initialization."
        : "Operator requested Otto start with initialization before looping.",
    );

    const preferenceInfo = this.callbacks.loadPreferenceInfo();
    if (preferenceInfo.source && ctx.hasUI) {
      services.ui.notify(
        preferenceInfo.error
          ? `Otto preferences fallback: ${preferenceInfo.source} could not be loaded (${preferenceInfo.error})`
          : `Loaded Otto preferences from ${preferenceInfo.source}`,
        preferenceInfo.error ? "warning" : "info",
      );
    }
    services.ui.notify("Otto started.", "success");
  }

  async resume(
    ctx: ExtensionCommandContext,
    nextStepCommand: string,
    resumeReason: string,
  ): Promise<void> {
    const services = this.getServices(ctx);
    const currentState = this.callbacks.getState();

    if (currentState.runId) {
      try {
        const session = await services.sessions.continueRunSession(
          currentState.runId,
        );
        if (
          session?.sessionPath &&
          session.sessionPath !== ctx.sessionManager.getSessionFile()
        ) {
          await ctx.waitForIdle();
          const switched = await ctx.switchSession(session.sessionPath);
          if (switched.cancelled) {
            services.ui.notify(
              `Otto resume could not switch back to ${session.sessionPath}; leaving the run paused.`,
              "warning",
            );
            return;
          }
        }

        const recorded = await services.sessions.getCurrentSessionHandle({
          runId: currentState.runId ?? undefined,
          policy: session?.policy ?? currentState.sessionPolicy,
        });
        this.callbacks.setState(
          applyOttoSessionStatus(this.callbacks.getState(), {
            sessionPolicy: recorded.policy,
            sessionSupport: recorded.support,
            lastSessionRotation: this.callbacks.getState().lastSessionRotation,
          }),
        );
        if (recorded.support === "unavailable") {
          services.ui.notify(
            "Otto resumed on the current Pi session because no Otto-managed session file was available for this run.",
            "warning",
          );
        }
        if (!session) {
          services.ui.notify(
            `Otto resume did not find existing session metadata for ${currentState.runId}; rebound the run to the current Pi session.`,
            "warning",
          );
        }
      } catch (sessionError) {
        this.callbacks.setState(
          applyOttoSessionStatus(this.callbacks.getState(), {
            sessionSupport: "failed",
            lastSessionRotation: "failed",
            lastError:
              sessionError instanceof Error
                ? sessionError.message
                : String(sessionError),
          }),
        );
        services.ui.notify(
          `Otto resume session lookup failed: ${this.callbacks.getState().lastError}`,
          "warning",
        );
      }
    }

    this.callbacks.setState(
      resumeOttoRunState(this.callbacks.getState(), nextStepCommand),
    );
    this.callbacks.persistState("resume");
    this.callbacks.updateUi(ctx);
    this.callbacks.queueWorkflowCommand(ctx, nextStepCommand, resumeReason);
    services.ui.notify("Otto resumed.", "success");
  }

  renderStatus(
    ctx: ExtensionCommandContext,
    state: OttoCoreState,
    options: OttoStatusRenderOptions,
  ): void {
    const services = this.getServices(ctx);
    const preferenceInfo = this.callbacks.loadPreferenceInfo();
    services.ui.notify(
      buildOttoStatusDetail(state, {
        preferencesSource: preferenceInfo.source,
        preferenceError: preferenceInfo.error,
        currentIssueLabel: options.currentIssueLabel,
        reasonLabel: options.reasonLabel,
        continuityLabel: options.continuityLabel,
        alert: options.alert,
        sessionAlert: options.sessionAlert,
      }),
      "info",
    );
    services.ui.renderStatus(buildOttoStatusSnapshot(state));
    this.callbacks.updateUi(ctx);
  }
}
