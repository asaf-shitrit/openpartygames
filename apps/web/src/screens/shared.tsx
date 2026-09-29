// Small shared pieces for the TV screens.
import type { ReactNode } from "react";
import { lazy, Suspense } from "react";
import { LOADING_ATTRIBUTE } from "../loading";

export interface TvPageProps {
  children: ReactNode;
  gap?: number;
}

/** The 1920x1080 page frame: padding, column, gap. */
export function TvPage({ children, gap = 28 }: TvPageProps) {
  return (
    <div
      style={{
        height: "100%",
        padding: "44px 72px 40px",
        display: "flex",
        flexDirection: "column",
        gap,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

export interface QrCodeProps {
  value: string;
  /** Rendered square size in px. */
  size?: number;
}

// The `qrcode` library is ~70 kB that only two screens draw with: the TV lobby and the VIP's
// no-TV share button. Every other guest's phone would download it for nothing, so it loads on
// demand, the same way a game's screens do.
const LazyQrCodeSvg = lazy(async () => ({
  default: (await import("./QrCodeSvg")).QrCodeSvg,
}));

/**
 * A QR code for `value`, loaded on demand. Until the library arrives it holds the same square
 * with no words in it, carrying the loading mark so the layout gallery waits for the real one.
 */
export function QrCode({ value, size = 156 }: QrCodeProps) {
  return (
    <Suspense
      fallback={
        <span
          {...{ [LOADING_ATTRIBUTE]: "" }}
          style={{ display: "inline-block", width: size, height: size }}
        />
      }
    >
      <LazyQrCodeSvg value={value} size={size} />
    </Suspense>
  );
}

/** Marker-red hand-drawn arrow pointing left/down toward the QR. */
export function ScanArrow({
  width = 110,
  height = 70,
}: {
  width?: number;
  height?: number;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 110 70"
      fill="none"
      stroke="#D7372B"
      strokeWidth={5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M104 20c-20 30-58 44-90 30" />
      <path d="M30 34L12 50l22 8" />
    </svg>
  );
}

/** Long right-pointing doodle arrow used in the footer lines. */
export function PointArrow({
  width = 76,
  height = 44,
}: {
  width?: number;
  height?: number;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 76 44"
      fill="none"
      stroke="#2B2B2B"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 26c18-10 40-12 64-4" />
      <path d="M54 10l16 12-18 10" />
    </svg>
  );
}
