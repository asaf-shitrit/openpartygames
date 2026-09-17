// Doodle line icons used across the platform chrome. Stroke uses currentColor.
import type { CSSProperties, ReactNode } from "react";

export type IconName =
  | "sound"
  | "sound-off"
  | "check"
  | "pencil"
  | "lock"
  | "eye-off"
  | "arrow-right"
  | "plus"
  | "reload"
  | "mask"
  | "cards"
  | "monitor"
  | "expand"
  | "kick"
  | "point";

interface IconSpec {
  viewBox: string;
  strokeWidth: number;
  nodes: ReactNode;
}

const ICONS = {
  sound: {
    viewBox: "0 0 24 24",
    strokeWidth: 2.4,
    nodes: (
      <>
        <path d="M4 9v6h4l5 4V5L8 9z" />
        <path d="M16.5 9a4 4 0 0 1 0 6" />
        <path d="M19 6.5a7.5 7.5 0 0 1 0 11" />
      </>
    ),
  },
  "sound-off": {
    viewBox: "0 0 24 24",
    strokeWidth: 2.4,
    nodes: (
      <>
        <path d="M4 9v6h4l5 4V5L8 9z" />
        <path d="M17 9l5 6M22 9l-5 6" />
      </>
    ),
  },
  check: {
    viewBox: "0 0 24 24",
    strokeWidth: 3,
    nodes: <path d="M5 12.5l4.5 4.5L19 7" />,
  },
  pencil: {
    viewBox: "0 0 24 24",
    strokeWidth: 2.4,
    nodes: (
      <>
        <path d="M4 20h4L19 9l-4-4L4 16z" />
        <path d="M13.5 6.5l4 4" />
      </>
    ),
  },
  lock: {
    viewBox: "0 0 24 24",
    strokeWidth: 2.4,
    nodes: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
  },
  "eye-off": {
    viewBox: "0 0 24 24",
    strokeWidth: 2.4,
    nodes: (
      <>
        <path d="M3 3l18 18" />
        <path d="M10.6 5.3A10.8 10.8 0 0 1 12 5.2c5 0 9 4.8 9 6.8 0 .6-1.1 2.4-3 3.9" />
        <path d="M6.2 6.6C3.9 8.2 3 10 3 12c0 2 4 6.8 9 6.8 1.4 0 2.7-.4 3.9-1" />
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      </>
    ),
  },
  "arrow-right": {
    viewBox: "0 0 24 24",
    strokeWidth: 2.6,
    nodes: <path d="M4 12h15M13 6l6 6-6 6" />,
  },
  plus: {
    viewBox: "0 0 24 24",
    strokeWidth: 2.4,
    nodes: <path d="M12 4.5c.3 5 0 10-.2 15M4.5 12.3c5-.4 10-.3 15 .1" />,
  },
  reload: {
    viewBox: "0 0 24 24",
    strokeWidth: 2.4,
    nodes: (
      <>
        <path d="M20 12a8 8 0 1 1-2.3-5.6" />
        <path d="M20 4v5h-5" />
      </>
    ),
  },
  mask: {
    viewBox: "0 0 100 100",
    strokeWidth: 7,
    nodes: (
      <>
        <path d="M8 38c14-10 28-10 42 0 14-10 28-10 42 0v12c0 18-12 30-26 30-8 0-13-5-16-11-3 6-8 11-16 11C20 80 8 68 8 50z" />
        <ellipse cx="30" cy="52" rx="9" ry="6" />
        <ellipse cx="70" cy="52" rx="9" ry="6" />
      </>
    ),
  },
  cards: {
    viewBox: "0 0 100 100",
    strokeWidth: 6,
    nodes: (
      <>
        <rect
          x="12"
          y="24"
          width="50"
          height="62"
          rx="8"
          transform="rotate(-10 37 55)"
        />
        <rect
          x="40"
          y="14"
          width="50"
          height="62"
          rx="8"
          transform="rotate(9 65 45)"
        />
        <path d="M52 46l9 9 17-19" transform="rotate(9 65 45)" />
      </>
    ),
  },
  monitor: {
    viewBox: "0 0 24 24",
    strokeWidth: 2.4,
    nodes: (
      <>
        <rect x="3" y="5" width="18" height="12" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
  },
  expand: {
    viewBox: "0 0 24 24",
    strokeWidth: 2.4,
    nodes: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  },
  kick: {
    viewBox: "0 0 24 24",
    strokeWidth: 2.4,
    nodes: (
      <>
        <path d="M14 4h5v16h-5" />
        <path d="M10 12H3M6 9l-3 3 3 3" />
      </>
    ),
  },
  point: {
    viewBox: "0 0 100 100",
    strokeWidth: 6,
    nodes: (
      <>
        <path d="M36 38H86a6 6 0 0 1 0 12H60" />
        <path d="M60 50c5 0 8 3 8 6.5S65 63 60 63" />
        <path d="M60 63c5 0 8 3 8 6.5S65 76 60 76" />
        <path d="M60 76c4 0 6 2.5 6 5.5S64 87 60 87H38c-12 0-22-10-22-22V56c0-10 8-18 18-18" />
        <path d="M36 38l8-10c3-4 9-4 11 1l-3 9" />
      </>
    ),
  },
} satisfies Record<IconName, IconSpec>;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: CSSProperties;
  /** Accessible label; omit for icons that are already labelled by adjacent text. */
  title?: string;
}

export function Icon({
  name,
  size = 28,
  color,
  strokeWidth,
  style,
  title,
}: IconProps) {
  const spec = ICONS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox={spec.viewBox}
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth={strokeWidth ?? spec.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {spec.nodes}
    </svg>
  );
}
