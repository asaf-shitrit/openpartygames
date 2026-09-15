// Crown doodle + Tally (crown with a "×N" marker count).
import type { CSSProperties } from "react";

export interface CrownProps {
    /** Width in px; height scales proportionally (40 x 34 doodle). */
    size?: number;
    strokeWidth?: number;
    style?: CSSProperties;
}

export function Crown({ size = 40, strokeWidth = 3, style }: CrownProps) {
    return (
        <svg
            width={size}
            height={(size * 34) / 40}
            viewBox="0 0 40 34"
            fill="#FFE45C"
            stroke="#2B2B2B"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ flexShrink: 0, ...style }}
        >
            <path d="M5 28l-2-20 10 9 7-13 7 13 10-9-2 20z" />
        </svg>
    );
}

export interface TallyProps {
    count: number;
    /** Crown width in px. */
    size?: number;
    style?: CSSProperties;
}

/** Doodle crown + marker "×N" — crowns earned for the room session. */
export function Tally({ count, size = 40, style }: TallyProps) {
    return (
        <div
            style={{ display: "flex", alignItems: "center", gap: 6, ...style }}
        >
            <Crown size={size} />
            <div
                className="opg-marker"
                style={{ fontSize: Math.round(size * 0.75), lineHeight: 1 }}
                aria-hidden="true"
            >
                ×{count}
            </div>
            <span
                style={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    overflow: "hidden",
                    clip: "rect(0 0 0 0)",
                    whiteSpace: "nowrap",
                }}
            >
                {count} {count === 1 ? "crown" : "crowns"}
            </span>
        </div>
    );
}
