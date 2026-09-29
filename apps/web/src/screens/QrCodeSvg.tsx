// The QR renderer proper. Its own module so the `qrcode` library lands in its own chunk; import
// `QrCode` from `./shared`, which loads this on demand.
import { useId, useMemo } from "react";
import { create } from "qrcode";
import { format, useLocale } from "@opg/i18n";
import type { QrCodeProps } from "./shared";

/** Renders a QR code as crisp SVG rects from qrcode's bit matrix. */
export function QrCodeSvg({ value, size = 156 }: QrCodeProps) {
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
