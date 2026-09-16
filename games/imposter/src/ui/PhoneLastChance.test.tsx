// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ServerClock } from "@opg/ui";
import type { ImposterAction } from "../state";
import {
  GuessView,
  GuessWaiting,
  initialThrottleState,
  throttleStep,
  TYPING_THROTTLE_MS,
} from "./PhoneLastChance";
import { imposterPreviews } from "./preview";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "vibrate");
});

function stubVibrate() {
  const vibrate = vi.fn<(pattern: number | number[]) => boolean>(() => true);
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: vibrate,
  });
  return vibrate;
}

function findPreview(label: string) {
  const preview = imposterPreviews.find(
    (candidate) => candidate.label === label,
  );
  if (preview === undefined) throw new Error(`no preview labelled ${label}`);
  if (preview.room.role !== "player") throw new Error(`${label} is not a phone`);
  if (!("myVote" in preview.view)) throw new Error(`${label} is not a player view`);
  return { view: preview.view, room: preview.room };
}

describe("throttleStep", () => {
  it("sends immediately when the interval has elapsed", () => {
    const result = throttleStep({
      state: initialThrottleState(),
      length: 3,
      now: 1000,
      intervalMs: TYPING_THROTTLE_MS,
      timerScheduled: false,
    });
    expect(result.sendNow).toBe(3);
    expect(result.scheduleDelayMs).toBeNull();
    expect(result.state).toEqual({ lastSentAt: 1000, pending: null });
  });

  it("throttles a fast follow-up and schedules a trailing send", () => {
    const first = throttleStep({
      state: initialThrottleState(),
      length: 1,
      now: 0,
      intervalMs: TYPING_THROTTLE_MS,
      timerScheduled: false,
    });
    const second = throttleStep({
      state: first.state,
      length: 2,
      now: 50,
      intervalMs: TYPING_THROTTLE_MS,
      timerScheduled: false,
    });
    expect(second.sendNow).toBeNull();
    expect(second.scheduleDelayMs).toBe(TYPING_THROTTLE_MS - 50);
    expect(second.state.pending).toBe(2);
  });

  it("does not reschedule when a trailing timer is already running", () => {
    const state = { lastSentAt: 0, pending: 2 };
    const result = throttleStep({
      state,
      length: 3,
      now: 100,
      intervalMs: TYPING_THROTTLE_MS,
      timerScheduled: true,
    });
    expect(result.sendNow).toBeNull();
    expect(result.scheduleDelayMs).toBeNull();
    expect(result.state.pending).toBe(3);
  });
});

describe("GuessView typing", () => {
  it("sends a bounded number of typing actions and ends on the final length", () => {
    vi.useFakeTimers();
    const { view, room } = findPreview("Phone: Priya last chance");
    const clock: ServerClock = { now: () => room.serverNow };
    const send = vi.fn<(action: ImposterAction) => void>();
    render(
      <GuessView
        view={view}
        players={room.players}
        me={room.players.find((p) => p.id === room.you) ?? null}
        deadline={room.game?.deadline ?? null}
        timerStartedAt={room.game?.timerStartedAt ?? null}
        clock={clock}
        send={send}
      />,
    );
    const input = screen.getByLabelText("Your guess");

    fireEvent.change(input, { target: { value: "h" } });
    fireEvent.change(input, { target: { value: "ho" } });
    fireEvent.change(input, { target: { value: "hor" } });
    fireEvent.change(input, { target: { value: "hors" } });
    fireEvent.change(input, { target: { value: "horse" } });

    const typingCalls = send.mock.calls.filter(
      ([action]) => action.type === "typing",
    );
    // The very first keystroke sends immediately; the rest are throttled into
    // at most one more trailing send.
    expect(typingCalls.length).toBeLessThanOrEqual(2);
    expect(typingCalls[0]?.[0]).toEqual({ type: "typing", length: 1 });

    act(() => {
      vi.advanceTimersByTime(TYPING_THROTTLE_MS);
    });
    const afterFlush = send.mock.calls.filter(
      ([action]) => action.type === "typing",
    );
    expect(afterFlush.at(-1)?.[0]).toEqual({ type: "typing", length: 5 });

    fireEvent.click(screen.getByRole("button", { name: "Submit guess" }));
    expect(send).toHaveBeenCalledWith({ type: "guess", text: "horse" });
  });

  it("stops sending typing updates once the guess is submitted", () => {
    vi.useFakeTimers();
    const { view, room } = findPreview("Phone: Priya last chance");
    const clock: ServerClock = { now: () => room.serverNow };
    const send = vi.fn<(action: ImposterAction) => void>();
    render(
      <GuessView
        view={view}
        players={room.players}
        me={room.players.find((p) => p.id === room.you) ?? null}
        deadline={room.game?.deadline ?? null}
        timerStartedAt={room.game?.timerStartedAt ?? null}
        clock={clock}
        send={send}
      />,
    );
    fireEvent.change(screen.getByLabelText("Your guess"), {
      target: { value: "horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit guess" }));
    send.mockClear();

    act(() => {
      vi.advanceTimersByTime(TYPING_THROTTLE_MS * 2);
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("skips a trailing typing send that was pending when the guess got submitted", () => {
    vi.useFakeTimers();
    const { view, room } = findPreview("Phone: Priya last chance");
    const clock: ServerClock = { now: () => room.serverNow };
    const send = vi.fn<(action: ImposterAction) => void>();
    render(
      <GuessView
        view={view}
        players={room.players}
        me={room.players.find((p) => p.id === room.you) ?? null}
        deadline={room.game?.deadline ?? null}
        timerStartedAt={room.game?.timerStartedAt ?? null}
        clock={clock}
        send={send}
      />,
    );
    const input = screen.getByLabelText("Your guess");
    // The first keystroke sends immediately; the second lands inside the throttle window and
    // schedules a trailing send that has not fired yet.
    fireEvent.change(input, { target: { value: "h" } });
    fireEvent.change(input, { target: { value: "ho" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit guess" }));
    send.mockClear();

    act(() => {
      vi.advanceTimersByTime(TYPING_THROTTLE_MS * 2);
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("cleans up its trailing timer on unmount", () => {
    vi.useFakeTimers();
    const { view, room } = findPreview("Phone: Priya last chance");
    const clock: ServerClock = { now: () => room.serverNow };
    const send = vi.fn<(action: ImposterAction) => void>();
    const { unmount } = render(
      <GuessView
        view={view}
        players={room.players}
        me={room.players.find((p) => p.id === room.you) ?? null}
        deadline={room.game?.deadline ?? null}
        timerStartedAt={room.game?.timerStartedAt ?? null}
        clock={clock}
        send={send}
      />,
    );
    fireEvent.change(screen.getByLabelText("Your guess"), {
      target: { value: "h" },
    });
    fireEvent.change(screen.getByLabelText("Your guess"), {
      target: { value: "ho" },
    });
    send.mockClear();
    unmount();
    act(() => {
      vi.advanceTimersByTime(TYPING_THROTTLE_MS * 2);
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("GuessWaiting", () => {
  it("tells the crew who is guessing and points them at the TV", () => {
    const { view, room } = findPreview("Phone: Dov waiting for guess");
    const clock: ServerClock = { now: () => room.serverNow };
    render(
      <GuessWaiting
        view={view}
        players={room.players}
        me={room.players.find((p) => p.id === room.you) ?? null}
        deadline={room.game?.deadline ?? null}
        timerStartedAt={room.game?.timerStartedAt ?? null}
        clock={clock}
        send={vi.fn<(action: ImposterAction) => void>()}
      />,
    );
    expect(screen.getByText("Priya is guessing…")).toBeTruthy();
    expect(screen.getByText("Eyes on the TV")).toBeTruthy();
  });

  it("speeds up the heartbeat once the last 5 seconds start", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    const { view, room } = findPreview("Phone: Dov waiting for guess");
    let fakeNow = 0;
    const clock: ServerClock = { now: () => fakeNow };
    render(
      <GuessWaiting
        view={view}
        players={room.players}
        me={room.players.find((p) => p.id === room.you) ?? null}
        deadline={8000}
        timerStartedAt={0}
        clock={clock}
        send={vi.fn<(action: ImposterAction) => void>()}
      />,
    );

    // A 1300ms window before the switch carries one slow beat (1100ms apart).
    act(() => {
      fakeNow = 1100;
      vi.advanceTimersByTime(1100);
    });
    vibrate.mockClear();
    act(() => {
      fakeNow = 2400;
      vi.advanceTimersByTime(1300);
    });
    const slowBeats = vibrate.mock.calls.length;
    expect(slowBeats).toBe(1);

    // Past the 5s mark the same window carries two fast beats (650ms apart).
    act(() => {
      fakeNow = 3000;
      vi.advanceTimersByTime(600);
    });
    vibrate.mockClear();
    act(() => {
      fakeNow = 4300;
      vi.advanceTimersByTime(1300);
    });
    expect(vibrate.mock.calls.length).toBe(2);
    expect(vibrate.mock.calls.length).toBeGreaterThan(slowBeats);
  });
});
