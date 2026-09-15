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
}

/** Max-width 480px phone column on the paper grid. */
export function PhoneScreen({ children, style }: PhoneScreenProps) {
  return (
    <div
      className="opg-root opg-grid-phone"
      style={{
        minHeight: "100dvh",
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
