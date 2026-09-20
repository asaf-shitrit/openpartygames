import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { LocaleProvider } from "@opg/i18n";
import { HAPTIC_PATTERNS, HEARTBEAT_MS } from "../haptics";
import { EyesOnTv } from "./EyesOnTv";

function renderEyesOnTv(ui: ReactElement) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

const vibrateDescriptor = Object.getOwnPropertyDescriptor(navigator, "vibrate");

function stubVibrate(): ReturnType<
  typeof vi.fn<(input: VibratePattern) => boolean>
> {
  const fn = vi.fn<(input: VibratePattern) => boolean>(() => true);
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: fn,
  });
  return fn;
}

beforeEach(() => {
  vi.useFakeTimers();
  Reflect.deleteProperty(navigator, "vibrate");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (vibrateDescriptor === undefined) {
    Reflect.deleteProperty(navigator, "vibrate");
    return;
  }
  Object.defineProperty(navigator, "vibrate", vibrateDescriptor);
});

describe("EyesOnTv", () => {
  it("renders the default title and a status role", () => {
    renderEyesOnTv(<EyesOnTv />);
    expect(screen.getByText("Eyes on the TV")).toBeDefined();
    expect(screen.getByRole("status")).toBeDefined();
  });

  it("renders a custom title and detail", () => {
    renderEyesOnTv(<EyesOnTv title="Here it comes…" detail="Watch the big screen" />);
    expect(screen.getByText("Here it comes…")).toBeDefined();
    expect(screen.getByText("Watch the big screen")).toBeDefined();
  });

  it("omits the detail when none is given", () => {
    const { container } = renderEyesOnTv(<EyesOnTv />);
    expect(container.querySelectorAll("span")).toHaveLength(1);
  });

  it("buzzes a heartbeat while it is on screen", () => {
    const vibrate = stubVibrate();
    renderEyesOnTv(<EyesOnTv />);
    expect(vibrate).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_MS.slow);
    });
    expect(vibrate).toHaveBeenCalledWith([...HAPTIC_PATTERNS.heartbeat]);
  });

  it("does not buzz when the tempo is off", () => {
    const vibrate = stubVibrate();
    renderEyesOnTv(<EyesOnTv tempo="off" />);
    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_MS.slow * 3);
    });
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("defaults to room copy for the room variant, naming the room rather than a missing screen", () => {
    renderEyesOnTv(<EyesOnTv variant="room" />);
    expect(screen.getByText("Eyes on the room")).toBeDefined();
    expect(screen.queryByText("Eyes on the TV")).toBeNull();
  });

  it("still lets the room variant take a custom title", () => {
    renderEyesOnTv(<EyesOnTv variant="room" title="Deep breaths…" />);
    expect(screen.getByText("Deep breaths…")).toBeDefined();
  });

  it("only announces the title; a detail change never touches the live region", () => {
    const { rerender } = renderEyesOnTv(
      <EyesOnTv title="The votes are in…" detail="Watch the big screen" />,
    );
    const liveRegion = screen.getByRole("status");
    expect(liveRegion.textContent).toBe("The votes are in…");
    rerender(
      <LocaleProvider>
        <EyesOnTv title="The votes are in…" detail="Here it comes…" />
      </LocaleProvider>,
    );
    expect(liveRegion.textContent).toBe("The votes are in…");
    expect(screen.getByText("Here it comes…")).toBeDefined();
  });
});

describe("EyesOnTv, in Hebrew", () => {
  afterEach(() => {
    window.localStorage.removeItem("opg:locale");
  });

  it("defaults to Hebrew titles for both variants", () => {
    window.localStorage.setItem("opg:locale", "he");
    const { rerender } = renderEyesOnTv(<EyesOnTv />);
    expect(screen.getByText("תסתכלו על הטלוויזיה")).toBeDefined();
    rerender(
      <LocaleProvider>
        <EyesOnTv variant="room" />
      </LocaleProvider>,
    );
    expect(screen.getByText("תסתכלו על החדר")).toBeDefined();
  });
});
