// No-TV stage for word-check: deliberately empty. No tally, no roster, no "look up" prompt --
// nothing that could suggest holding this phone up for someone else. The crew word is on
// every crew phone right now, so this phase is the sharp case for plan/0004-no-tv-mode.md §4:
// a phase shows the stage OR the player's secret, never both. Word-check shows only the card.
import type { CSSProperties } from "react";
import { useLocale } from "@opg/i18n";

const WRAP: CSSProperties = {
  boxSizing: "border-box",
  padding: "18px 16px",
  display: "flex",
  alignItems: "center",
  gap: 14,
  border: "3px dashed var(--opg-muted)",
  borderRadius: "26px 10px 22px 12px / 12px 22px 10px 26px",
};

const DOT: CSSProperties = {
  width: 5,
  height: 5,
  borderRadius: "50%",
  background: "var(--opg-muted)",
};

function ThreeDots() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }} aria-hidden="true">
      <div style={DOT} />
      <div style={DOT} />
      <div style={DOT} />
    </div>
  );
}

/** The stage region during word-check: empty on purpose. */
export function StageWordCheck() {
  const { t } = useLocale();
  return (
    <div style={WRAP}>
      <ThreeDots />
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "var(--opg-ink-secondary)",
          lineHeight: 1.3,
        }}
      >
        {t.imposter.wordCheck.stageEmpty}
      </div>
    </div>
  );
}
