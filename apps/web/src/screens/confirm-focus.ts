// Keeping keyboard focus with a control that replaces itself.
import { useEffect, useRef, useState } from "react";

/**
 * Watches a two-step confirm and moves focus into whichever step just appeared. Returns the
 * callback ref to put on the container holding both steps.
 *
 * A two-step confirm swaps the button that was just pressed for a different subtree. React
 * unmounts the pressed button, so focus falls to `<body>` and a keyboard user has to tab from
 * the top of the document to reach the confirmation they just opened, passing every other
 * control on the way. For an irreversible action that is the worst moment to lose your place.
 *
 * Which control it lands on depends on the direction:
 *
 * - **Opening**, the first button. Both call sites order the safe choice first, and that is
 *   deliberate here rather than cosmetic: the key that opened the step can still be held down,
 *   and an auto-repeated Enter onto a focused destructive button would confirm it with no
 *   second decision.
 * - **Closing**, the last button — the one that opened the step. In a row of "skip" then "end
 *   game", that puts focus back on "end game" where the user left it, not on "skip".
 *
 * The first render is skipped: these controls sit in a list that renders long before anyone
 * interacts with it, and grabbing focus on mount would yank the page around.
 *
 * It hands back a callback ref rather than taking a `RefObject` so the element it reads is a
 * real dependency of the effect instead of a mutable box the dependency rules cannot see.
 */
export function useFocusOnStepChange(
  confirming: boolean,
): (node: HTMLElement | null) => void {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const rendered = useRef(false);

  useEffect(() => {
    // A callback ref arrives on the render after the first, so "have we seen the container
    // yet" is the honest test for first-run. Keying on the effect alone fires once with a
    // null container and then treats the container's arrival as a step change, which grabs
    // focus on mount — the exact thing this guard exists to prevent.
    if (!container) return;
    if (!rendered.current) {
      rendered.current = true;
      return;
    }
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    if (buttons.length === 0) return;
    const target = confirming ? buttons[0] : buttons[buttons.length - 1];
    target?.focus();
  }, [confirming, container]);

  return setContainer;
}
