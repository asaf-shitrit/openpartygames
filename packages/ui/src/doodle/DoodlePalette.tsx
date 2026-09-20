// Six marker-ink swatches, native radio inputs so the group gets checked-state, labelling and
// keyboard navigation for free. The selected swatch is marked by a thicker ink ring plus a check
// glyph — never colour alone (CLAUDE.md, design/AVATARS.md).
import type { CSSProperties } from "react";
import type { InkIndex } from "./types";

const SWATCH_SIZE = 44;

export interface DoodlePaletteProps {
  inks: readonly string[];
  inkNames: readonly string[];
  selected: InkIndex;
  onSelect: (ink: InkIndex) => void;
  name: string;
}

function swatchStyle(ink: string, selected: boolean): CSSProperties {
  return {
    appearance: "none",
    WebkitAppearance: "none",
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: "50%",
    border: selected ? "5px solid #2B2B2B" : "3px solid #2B2B2B",
    boxShadow: selected ? "0 0 0 3px #FBF8F1, 0 0 0 6px #2B2B2B" : "none",
    background: ink,
    margin: 0,
    padding: 0,
    cursor: "pointer",
  };
}

function CheckGlyph() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#D7372B"
      strokeWidth={3.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        position: "absolute",
        right: -4,
        bottom: -4,
        background: "#FBF8F1",
        borderRadius: "50%",
        pointerEvents: "none",
      }}
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

function Swatch({
  ink,
  name,
  groupName,
  selected,
  onSelect,
}: {
  ink: string;
  name: string;
  groupName: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label style={{ position: "relative", display: "inline-flex" }}>
      <input
        type="radio"
        name={groupName}
        checked={selected}
        onChange={onSelect}
        aria-label={selected ? `${name} pen, selected` : `${name} pen`}
        style={swatchStyle(ink, selected)}
      />
      {selected ? <CheckGlyph /> : null}
    </label>
  );
}

export function DoodlePalette({ inks, inkNames, selected, onSelect, name }: DoodlePaletteProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Pen colour"
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
    >
      {inks.map((ink, index) => (
        <Swatch
          key={ink}
          ink={ink}
          name={inkNames[index] ?? `Ink ${index + 1}`}
          groupName={name}
          selected={index === selected}
          onSelect={() => onSelect(index)}
        />
      ))}
    </div>
  );
}
