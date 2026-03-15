import type { OttoOperatorUi, OttoStatusSnapshot } from "../core";

export class NullOttoOperatorUi implements OttoOperatorUi {
  notify(): void {}

  async choose<T>(): Promise<T | null> {
    return null;
  }

  renderStatus(_snapshot: OttoStatusSnapshot): void {}
}
