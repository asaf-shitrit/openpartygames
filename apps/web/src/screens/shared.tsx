// Small shared pieces for the TV screens.
import type { ReactNode } from "react";
import { useId, useMemo } from "react";
import { create } from "qrcode";
import { format, useLocale } from "@opg/i18n";

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

/** Renders a QR code as crisp SVG rects from qrcode's bit matrix. */
export function QrCode({ value, size = 156 }: QrCodeProps) {
  const { t } = useLocale();
  const { dimension, path } = useMemo(() => {
    const qr = create(value);
    const n = qr.modules.size;
    const data = qr.modules.data;
    let d = "";
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (data[row * n + col]) d += `M${col} ${row}h1v1h-1z`;
      }
    }
    return { dimension: n, path: d };
  }, [value]);

  const titleId = useId();
  return (
    <svg
      className="opg-qr"
      width={size}
      height={size}
      viewBox={`0 0 ${dimension} ${dimension}`}
      aria-labelledby={titleId}
    >
      <title id={titleId}>{format(t.status.qrCodeAlt, { value })}</title>
      <path fill="#2B2B2B" d={path} />
    </svg>
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
