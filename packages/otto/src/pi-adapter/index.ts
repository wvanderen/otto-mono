import type { OttoOperatorUi, OttoStatusSnapshot } from "../core";

export class NullOttoOperatorUi implements OttoOperatorUi {
  notify(): void {}

  isInteractive(): boolean {
    return false;
  }

  async choose<T>(): Promise<T | null> {
    return null;
  }

  async select(): Promise<string | null> {
    return null;
  }

  renderStatus(_snapshot: OttoStatusSnapshot): void {}
}

export * from "./commands";
export * from "./composition";
export * from "./session-control";
export * from "./ui";
