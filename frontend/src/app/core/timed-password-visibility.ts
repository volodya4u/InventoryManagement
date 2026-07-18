import { signal } from '@angular/core';

const PASSWORD_VISIBILITY_DURATION_MS = 5_000;

export class TimedPasswordVisibility {
  readonly visible = signal(false);

  private hideTimer: ReturnType<typeof setTimeout> | undefined;

  toggle(): void {
    if (this.visible()) {
      this.hide();
      return;
    }

    this.visible.set(true);
    this.clearTimer();
    this.hideTimer = setTimeout(() => {
      this.visible.set(false);
      this.hideTimer = undefined;
    }, PASSWORD_VISIBILITY_DURATION_MS);
  }

  destroy(): void {
    this.clearTimer();
  }

  private hide(): void {
    this.clearTimer();
    this.visible.set(false);
  }

  private clearTimer(): void {
    if (this.hideTimer !== undefined) {
      clearTimeout(this.hideTimer);
      this.hideTimer = undefined;
    }
  }
}
