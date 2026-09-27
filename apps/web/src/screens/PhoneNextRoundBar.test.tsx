import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { PhoneNextRoundBar } from "./PhoneNextRoundBar";

function setup(onNextRound = vi.fn<() => void>()) {
  render(
    <LocaleProvider>
      <PhoneNextRoundBar onNextRound={onNextRound} />
    </LocaleProvider>,
  );
  return onNextRound;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("PhoneNextRoundBar", () => {
  it("offers the VIP the next game from the finale itself", () => {
    const onNextRound = setup();
    fireEvent.click(screen.getByRole("button", { name: /pick the next game/i }));
    expect(onNextRound).toHaveBeenCalledTimes(1);
  });

  // This asserted `position: fixed` when the bar was rendered beside the results column. It
  // was rewritten, not deleted, because the behaviour deliberately changed: pinning it to the
  // viewport reserved no space, so it sat on top of the bottom of the column and — in a no-TV
  // room, where the standings render on the phone — the last rank's own centre hit-tested as
  // this button instead of the row. It now rides in `PhoneResults`' `footer` slot, in flow,
  // which is the whole reason the overlap is gone. Going back to fixed puts it straight back.
  it("lays out in flow, so it reserves its own space instead of covering the column", () => {
    setup();
    const bar = screen.getByRole("button").closest("div");
    expect(bar?.style.position).toBe("");
    expect(bar?.style.insetBlockEnd).toBe("");
  });

  it("renders in Hebrew", () => {
    window.localStorage.setItem("opg:locale", "he");
    setup();
    expect(screen.getByText("בחרו את המשחק הבא")).toBeTruthy();
  });
});
