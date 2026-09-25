// Fixed 1920x1080 TV stage and the phone column.
import type { CSSProperties, ReactNode } from "react";
import { useLayoutEffect, useState } from "react";

export interface StageProps {
  children: ReactNode;
  /** Background behind the letterbox bars. */
  background?: string;
}

/** Fixed 1920x1080 surface scaled to fit the viewport, letterboxed and centered. */
export function Stage({ children, background = "#2B2B2B" }: StageProps) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const update = () =>
      setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background,
        overflow: "hidden",
      }}
    >
      <div
        className="opg-root opg-grid-tv"
        style={{
          width: 1920,
          height: 1080,
          flexShrink: 0,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export interface PhoneScreenProps {
  children: ReactNode;
  style?: CSSProperties;
  /**
   * Clamp the column to the phone instead of letting it grow. `minHeight` alone gives a
   * column no reason to shrink, so a flexible middle keeps its content size and pushes the
   * action under it off the bottom edge — where a player cannot tap it and nothing scrolls,
   * because a sliver of it is still on screen.
   *
   * Set it on a screen built as header / flexible middle / action, where the middle has
   * `flex: "1 1 0"` and `minHeight: 0` and can give up space. Leave it off a screen that is
   * genuinely a long list and means to scroll.
   */
  fit?: boolean;
}

/** Max-width 480px phone column on the paper grid. */
export function PhoneScreen({ children, style, fit = false }: PhoneScreenProps) {
  return (
    <div
      className="opg-root opg-grid-phone"
      style={{
        minHeight: "100dvh",
        height: fit ? "100dvh" : undefined,
        // A clamped screen works by having a flexible middle that gives up space. At 200% text
        // there comes a point where the middle has nothing left to give, and then the choice is
        // between an action pushed off the bottom edge and a column that scrolls. Scrolling
        // wins: the action is still reachable. At any normal size the content fits and this
        // never engages.
        overflowY: fit ? "auto" : undefined,
        width: "100%",
        maxWidth: 480,
        margin: "0 auto",
        padding: "20px 18px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
