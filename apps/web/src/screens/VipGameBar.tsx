import { Button } from "@opg/ui";
import { useState } from "react";

export interface VipGameBarProps {
  onSkip: () => void;
  onEnd: () => void;
}

/** In-game controls only the VIP sees, placed under the game so they never cover it. */
export function VipGameBar({ onSkip, onEnd }: VipGameBarProps) {
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  return (
    <section
      aria-label="VIP controls"
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
      <div style={{ fontSize: 16, fontWeight: 700, color: "#555555" }}>You're the VIP</div>
      {confirmingEnd ? (
        <EndConfirm onEnd={onEnd} onCancel={() => setConfirmingEnd(false)} />
      ) : (
        <div style={{ display: "flex", gap: 12 }}>
          <Button variant="secondary" onClick={onSkip}>
            Skip this part
          </Button>
          <Button variant="secondary" onClick={() => setConfirmingEnd(true)}>
            End game
          </Button>
        </div>
      )}
    </section>
  );
}

function EndConfirm({ onEnd, onCancel }: { onEnd: () => void; onCancel: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 18 }}>End the game for everyone? Scores so far won't earn a crown.</div>
      <div style={{ display: "flex", gap: 12 }}>
        <Button onClick={onEnd}>Yes, end it</Button>
        <Button variant="secondary" onClick={onCancel}>
          Keep playing
        </Button>
      </div>
    </div>
  );
}
