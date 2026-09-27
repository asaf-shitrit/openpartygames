import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { useFocusOnStepChange } from "./confirm-focus";

afterEach(cleanup);

/** A two-step control shaped like the real ones: safe choice first in the DOM. */
function Confirm() {
  const [confirming, setConfirming] = useState(false);
  const setStep = useFocusOnStepChange(confirming);
  return (
    <div ref={setStep}>
      {confirming ? (
        <>
          <button type="button" onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button type="button">Yes, do it</button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}>
          Start
        </button>
      )}
    </div>
  );
}

/** A container the hook will find no button inside, to prove it does not throw or steal focus. */
function Empty() {
  const [confirming, setConfirming] = useState(false);
  const setStep = useFocusOnStepChange(confirming);
  return (
    <>
      <button type="button" onClick={() => setConfirming(true)}>
        Bump
      </button>
      <div ref={setStep} />
    </>
  );
}

describe("useFocusOnStepChange", () => {
  it("leaves focus alone on the first render", () => {
    render(<Confirm />);
    // These controls sit in a list that renders long before anyone touches it.
    expect(document.activeElement).toBe(document.body);
  });

  it("focuses the safe choice when the step opens", () => {
    render(<Confirm />);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cancel" }),
    );
    // Not the destructive one: a held Enter would otherwise auto-repeat straight onto it.
    expect(document.activeElement).not.toBe(
      screen.getByRole("button", { name: "Yes, do it" }),
    );
  });

  it("returns focus to the trigger when the step closes", () => {
    render(<Confirm />);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Start" }),
    );
  });

  it("does nothing when the ref holds no button", () => {
    render(<Empty />);
    const bump = screen.getByRole("button", { name: "Bump" });
    bump.focus();
    fireEvent.click(bump);
    // Focus stays put rather than being thrown at the document.
    expect(document.activeElement).toBe(bump);
  });
});
