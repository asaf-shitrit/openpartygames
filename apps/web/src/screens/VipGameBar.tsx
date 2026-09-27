import { Button } from "@opg/ui";
import { useState } from "react";
import { useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { useFocusOnStepChange } from "./confirm-focus";

export interface VipGameBarProps {
  /**
   * Identity of the round on screen, plus whatever the server last complained about. It
   * changes exactly when the room has answered — which is what re-enables a tapped control.
   * `PlayerApp.settledKeyOf` builds it.
   */
  settledBy: string;
  onSkip: () => void;
  onEnd: () => void;
}

/**
 * Latches an action pending on the tap and clears it when `settledBy` changes. `onSkip` and
 * `onEnd` are fire-and-forget socket sends, so without a latch a VIP on a slow link taps twice
 * and skips two phases of a live game. What clears the latch has to be the server's own word:
 * a fixed cooldown is wrong in both directions, re-enabling before a slow room has advanced
 * and making a fast one wait for nothing.
 */
function usePendingUntil(
  settledBy: string,
  action: () => void,
): [boolean, () => void] {
  const [pending, setPending] = useState(false);
  // Adjusted during render against a newly-arrived prop — React's documented pattern for
  // resetting state when a prop changes, and the one `PhoneVipControls` uses for the same
  // job. Nothing outside React observes it, so it is not an effect.
  const [lastSettledBy, setLastSettledBy] = useState(settledBy);
  if (lastSettledBy !== settledBy) {
    setLastSettledBy(settledBy);
    if (pending) setPending(false);
  }
  const trigger = () => {
    if (pending) return;
    setPending(true);
    action();
  };
  return [pending, trigger];
}

/** In-game controls only the VIP sees, placed under the game so they never cover it. */
export function VipGameBar({ settledBy, onSkip, onEnd }: VipGameBarProps) {
  const { t } = useLocale();
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [skipping, triggerSkip] = usePendingUntil(settledBy, onSkip);
  const setStep = useFocusOnStepChange(confirmingEnd);
  return (
    <section
      className="opg-root"
      aria-label={t.picker.vipControlsAriaLabel}
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "20px 18px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        borderTop: "2px dashed var(--opg-muted)",
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
        {t.picker.youreVip}
      </div>
      {/*
        Holds a ref across the swap without adding a box. Opening the confirm puts focus on
        "keep playing", the safe choice; closing it puts focus back on "end game", the control
        that opened it. Without this the pressed button is unmounted and focus falls to
        `<body>`.
      */}
      <span ref={setStep} style={{ display: "contents" }}>
        {confirmingEnd ? (
          <EndConfirm
            t={t}
            settledBy={settledBy}
            onEnd={onEnd}
            onCancel={() => setConfirmingEnd(false)}
          />
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Button
              variant="secondary"
              onClick={triggerSkip}
              disabled={skipping}
            >
              {skipping ? t.picker.skippingThisPart : t.picker.skipThisPart}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmingEnd(true)}>
              {t.picker.endGame}
            </Button>
          </div>
        )}
      </span>
    </section>
  );
}

function EndConfirm({
  t,
  settledBy,
  onEnd,
  onCancel,
}: {
  t: Dictionary;
  settledBy: string;
  onEnd: () => void;
  onCancel: () => void;
}) {
  const [ending, triggerEnd] = usePendingUntil(settledBy, onEnd);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 18 }}>{t.picker.endGameConfirm}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {/* The safe choice (keep playing) carries the visual weight; the irreversible one
            uses the danger variant, so weight and consequence point the same way. */}
        <Button variant="primary" onClick={onCancel}>
          {t.picker.keepPlaying}
        </Button>
        <Button variant="danger" onClick={triggerEnd} disabled={ending}>
          {t.picker.yesEndIt}
        </Button>
      </div>
    </div>
  );
}
