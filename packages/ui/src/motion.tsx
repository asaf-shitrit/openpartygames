// Shared phase-change enter animation.
import type { CSSProperties, ReactNode } from "react";

export interface PhaseEnterProps {
  /** Changes whenever the phase changes, e.g. `${round}:${phase}`. */
  phaseKey: string;
  children: ReactNode;
  style?: CSSProperties;
}

const FRAME_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flexGrow: 1,
  gap: "inherit",
  minHeight: 0,
};

/**
 * Replays a short enter animation when phaseKey changes, so players notice a phase change.
 * Changing phaseKey remounts the children, so phase-local state resets.
 */
export function PhaseEnter({ phaseKey, children, style }: PhaseEnterProps) {
  return (
    <div
      key={phaseKey}
      className="opg-phase-enter"
      style={{ ...FRAME_STYLE, ...style }}
    >
      {children}
    </div>
  );
}
