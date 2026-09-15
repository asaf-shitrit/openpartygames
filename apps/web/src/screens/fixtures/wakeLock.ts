// Fake Screen Wake Lock API for web app tests that render host and player apps.
import { vi } from "vitest";

const wakeLockDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "wakeLock",
);

export class FakeWakeLockSentinel {
  released = false;
  release = vi.fn<() => Promise<void>>(() => {
    this.released = true;
    return Promise.resolve();
  });
}

/** Installs a fake `navigator.wakeLock.request`. */
export function stubWakeLock(
  request: () => Promise<FakeWakeLockSentinel>,
): void {
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: { request },
  });
}

/** Puts `navigator.wakeLock` back the way it was before the test. */
export function restoreWakeLock(): void {
  if (wakeLockDescriptor === undefined) {
    Reflect.deleteProperty(navigator, "wakeLock");
    return;
  }
  Object.defineProperty(navigator, "wakeLock", wakeLockDescriptor);
}
