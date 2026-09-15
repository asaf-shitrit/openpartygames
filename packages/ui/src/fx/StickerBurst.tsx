// Sticker burst: the doodle replacement for confetti, used for steals, personal
// wins and the crown. Placement is deterministic (golden-angle fan, no random),
// so a reconnect renders the same burst. `live` gates the pop: a reconnect
// mid-reveal renders the settled stickers with no animation.
import type { CSSProperties } from "react";
import { AVATAR_FILLS } from "../Avatar";

/** Sticker fills, borrowed from the avatar palette so the burst stays in foolscap. */
export const DEFAULT_STICKER_COLORS: readonly string[] =
  Object.values(AVATAR_FILLS);

const GOLDEN_ANGLE_DEG = 137.508;
const STAGGER_MS = 40;

export interface StickerBurstProps {
  /** Pop on mount. False renders settled stickers (reconnecting mid-reveal). */
  live: boolean;
  /** Number of stickers. */
  count?: number;
  /** Diameter of the burst area in stage px. */
  size?: number;
  /** Fill colors; defaults to the avatar palette. */
  colors?: readonly string[];
  style?: CSSProperties;
  className?: string;
}

export interface StickerPlacement {
  /** Offset from the burst center in px. */
  x: number;
  y: number;
  /** Doodle tilt in degrees. */
  rotate: number;
}

/** Deterministic placement for sticker `index`: a golden-angle fan around the center. */
export function stickerAt(index: number, size: number): StickerPlacement {
  const angle = (index * GOLDEN_ANGLE_DEG * Math.PI) / 180;
  const radius = size * (0.16 + ((index * 37) % 100) / 260);
  return {
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius * 0.72),
    rotate: ((index * 53) % 360) - 180,
  };
}

function colorAt(colors: readonly string[], index: number): string {
  return colors[index % colors.length] ?? "#FFE45C";
}

function StickerGlyph({ color, star }: { color: string; star: boolean }) {
  if (star) {
    return (
      <svg width={48} height={48} viewBox="0 0 100 100" aria-hidden="true">
        <path
          d="M50 8l12 26 28 3-21 19 6 28-25-14-25 14 6-28-21-19 28-3z"
          fill={color}
          stroke="#2B2B2B"
          strokeWidth={6}
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width={48} height={48} viewBox="0 0 100 100" aria-hidden="true">
      <circle
        cx={50}
        cy={50}
        r={42}
        fill={color}
        stroke="#2B2B2B"
        strokeWidth={6}
      />
    </svg>
  );
}

export function StickerBurst({
  live,
  count = 18,
  size = 360,
  colors = DEFAULT_STICKER_COLORS,
  style,
  className,
}: StickerBurstProps) {
  const stickers = Array.from({ length: Math.max(0, count) }, (_, index) => ({
    id: `sticker-${index}`,
    ...stickerAt(index, size),
    color: colorAt(colors, index),
    star: index % 2 === 0,
    delayMs: index * STAGGER_MS,
  }));
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 0,
        height: 0,
        pointerEvents: "none",
        ...style,
      }}
    >
      {stickers.map((sticker) => (
        <div
          key={sticker.id}
          className={live ? "opg-fx-sticker" : undefined}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            translate: `${sticker.x}px ${sticker.y}px`,
            rotate: `${sticker.rotate}deg`,
            animationDelay: live ? `${sticker.delayMs}ms` : undefined,
          }}
        >
          <StickerGlyph color={sticker.color} star={sticker.star} />
        </div>
      ))}
    </div>
  );
}
