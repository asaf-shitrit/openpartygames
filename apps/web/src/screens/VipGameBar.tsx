import { Button } from "@opg/ui";
import { useState } from "react";
import { useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";

export interface VipGameBarProps {
  onSkip: () => void;
  onEnd: () => void;
}

/** In-game controls only the VIP sees, placed under the game so they never cover it. */
export function VipGameBar({ onSkip, onEnd }: VipGameBarProps) {
  const { t } = useLocale();
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  return (
    <section
      aria-label={t.picker.vipControlsAriaLabel}
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "16px 18px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        borderTop: "2px dashed #8A8A8A",
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color: "#555555" }}>
        {t.picker.youreVip}
      </div>
      {confirmingEnd ? (
        <EndConfirm t={t} onEnd={onEnd} onCancel={() => setConfirmingEnd(false)} />
      ) : (
        <div style={{ display: "flex", gap: 12 }}>
          <Button variant="secondary" onClick={onSkip}>
            {t.picker.skipThisPart}
          </Button>
          <Button variant="secondary" onClick={() => setConfirmingEnd(true)}>
            {t.picker.endGame}
          </Button>
        </div>
      )}
    </section>
  );
}

function EndConfirm({
  t,
  onEnd,
  onCancel,
}: {
  t: Dictionary;
  onEnd: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 18 }}>{t.picker.endGameConfirm}</div>
      <div style={{ display: "flex", gap: 12 }}>
        <Button onClick={onEnd}>{t.picker.yesEndIt}</Button>
        <Button variant="secondary" onClick={onCancel}>
          {t.picker.keepPlaying}
        </Button>
      </div>
    </div>
  );
}
