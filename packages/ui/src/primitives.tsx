// Core Doodle Notebook surfaces and controls.
import type { CSSProperties, InputHTMLAttributes, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";

export type CardVariant = "L" | "M" | "Malt";

/** Shared hover/press feedback class for tappable elements, including raw buttons outside the kit. */
export const PRESSABLE_CLASS = "opg-pressable";

const CARD_RADII = {
  L: "var(--opg-radius-l)",
  M: "var(--opg-radius-m)",
  Malt: "var(--opg-radius-m-alt)",
} satisfies Record<CardVariant, string>;

export interface CardProps {
  variant?: CardVariant;
  tilt?: number;
  background?: string;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export function Card({
  variant = "L",
  tilt,
  background,
  children,
  style,
  className,
}: CardProps) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        background: background ?? "var(--opg-card)",
        border: "4px solid var(--opg-ink)",
        borderRadius: CARD_RADII[variant],
        transform: tilt === undefined ? undefined : `rotate(${tilt}deg)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface StickyNoteProps {
  children: ReactNode;
  tilt?: number;
  style?: CSSProperties;
  className?: string;
}

export function StickyNote({
  children,
  tilt = -1.5,
  style,
  className,
}: StickyNoteProps) {
  return (
    <div
      className={className}
      style={{
        background: "var(--opg-highlight)",
        boxShadow: "0 6px 12px rgba(43, 43, 43, 0.14)",
        transform: `rotate(${tilt}deg)`,
        padding: "12px 14px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface LinedCardProps {
  children: ReactNode;
  tilt?: number;
  style?: CSSProperties;
  className?: string;
}

/** Lined index card: red margin line at 38px, blue rules every 38px. */
export function LinedCard({
  children,
  tilt = 1,
  style,
  className,
}: LinedCardProps) {
  return (
    <div
      className={["opg-lined", className].filter(Boolean).join(" ")}
      style={{
        position: "relative",
        border: "4px solid var(--opg-ink)",
        borderRadius: "var(--opg-radius-m)",
        paddingLeft: 56,
        transform: `rotate(${tilt}deg)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface TapeProps {
  left?: number | string;
  right?: number | string;
  top?: number | string;
  width?: number | string;
  height?: number | string;
  rotate?: number;
  color?: string;
  style?: CSSProperties;
}

/** Translucent tape strip, absolutely positioned on a relative parent. */
export function Tape({
  left,
  right,
  top = -22,
  width = 180,
  height = 44,
  rotate = -3,
  color,
  style,
}: TapeProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left,
        right,
        top,
        width,
        height,
        background: color ?? "var(--opg-tape)",
        transform: `rotate(${rotate}deg)`,
        ...style,
      }}
    />
  );
}

export interface HighlightProps {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
  className?: string;
}

/** Highlighter swipe behind a key word. */
export function Highlight({
  children,
  color,
  style,
  className,
}: HighlightProps) {
  return (
    <span
      className={className}
      style={{
        position: "relative",
        display: "inline-block",
        padding: "0 12px",
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "44%",
          height: "50%",
          background: color ?? "var(--opg-highlight)",
          borderRadius: 8,
          transform: "rotate(-2deg)",
        }}
      />
      <span style={{ position: "relative", display: "inline-block" }}>
        {children}
      </span>
    </span>
  );
}

export interface MarkerProps {
  children: ReactNode;
  size?: number;
  color?: string;
  style?: CSSProperties;
  className?: string;
}

/** Permanent Marker heading text. */
export function Marker({
  children,
  size = 56,
  color,
  style,
  className,
}: MarkerProps) {
  return (
    <span
      className={["opg-marker", className].filter(Boolean).join(" ")}
      style={{ display: "block", fontSize: size, color, ...style }}
    >
      {children}
    </span>
  );
}

export interface StampProps {
  children: ReactNode;
  size?: number;
  color?: string;
  tilt?: number;
  style?: CSSProperties;
}

/** Marker stamp, e.g. REAL / NAH / IMPOSTER! / VIP / Picked. */
export function Stamp({
  children,
  size = 38,
  color,
  tilt = -6,
  style,
}: StampProps) {
  const c = color ?? "var(--opg-marker)";
  return (
    <div
      className="opg-marker"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 18px",
        border: `5px solid ${c}`,
        borderRadius: "var(--opg-radius-button)",
        color: c,
        fontSize: size,
        lineHeight: 1.1,
        transform: `rotate(${tilt}deg)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export type ButtonSize = "md" | "lg" | "xl" | "hero";

const BUTTON_SIZES = {
  md: { height: 48, padding: "0 18px", fontSize: 18 },
  lg: { height: 60, padding: "0 24px", fontSize: 21 },
  xl: { height: 64, padding: "0 24px", fontSize: 22 },
  hero: { height: 96, padding: "0 52px", fontSize: 44 },
} satisfies Record<
  ButtonSize,
  { height: number; padding: string; fontSize: number }
>;

export interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "secondary";
  size?: ButtonSize;
  disabled?: boolean;
  /** Shown as small text under the button when it is disabled (never color alone). */
  disabledReason?: string;
  onClick?: () => void;
  fullWidth?: boolean;
  style?: CSSProperties;
  className?: string;
  "aria-label"?: string;
}

function buttonStyle(
  dims: (typeof BUTTON_SIZES)[ButtonSize],
  primary: boolean,
  disabled: boolean,
  fullWidth: boolean,
): CSSProperties {
  return {
    height: dims.height,
    padding: dims.padding,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    background: primary ? "var(--opg-ink)" : "var(--opg-card)",
    color: primary ? "var(--opg-paper)" : "var(--opg-ink)",
    border: "4px solid var(--opg-ink)",
    borderRadius: "var(--opg-radius-button)",
    fontFamily: "var(--opg-font-body)",
    fontSize: dims.fontSize,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    width: fullWidth ? "100%" : undefined,
  };
}

export function Button({
  children,
  variant = "primary",
  size = "lg",
  disabled = false,
  disabledReason,
  onClick,
  fullWidth = false,
  style,
  className,
  "aria-label": ariaLabel,
}: ButtonProps) {
  const dims = BUTTON_SIZES[size];
  const primary = variant === "primary";
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 4,
        width: fullWidth ? "100%" : undefined,
      }}
    >
      <button
        type="button"
        className={[PRESSABLE_CLASS, className].filter(Boolean).join(" ")}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        onClick={disabled ? undefined : onClick}
        style={{ ...buttonStyle(dims, primary, disabled, fullWidth), ...style }}
      >
        {children}
      </button>
      {disabled && disabledReason ? (
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--opg-ink-secondary)",
            textAlign: "center",
          }}
        >
          {disabledReason}
        </span>
      ) : null}
    </span>
  );
}

export interface ChipProps {
  children: ReactNode;
  height?: number;
  fontSize?: number;
  style?: CSSProperties;
}

export function Chip({
  children,
  height = 48,
  fontSize = 18,
  style,
}: ChipProps) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        height,
        padding: `0 ${Math.round(height * 0.45)}px`,
        background: "var(--opg-card)",
        border: "4px solid var(--opg-ink)",
        borderRadius: "var(--opg-radius-button)",
        fontSize,
        lineHeight: 1.1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  /** Accessible name for the switch itself. */
  label?: string;
  onLabel?: string;
  offLabel?: string;
  /** Track height; knob and width scale with it. */
  size?: number;
  /**
   * Size of the visible "On"/"Off" text. Defaults to the phone floor (16px+); a caller
   * placing this on the TV surface must raise it to that surface's 28px floor itself, the
   * same way every other TV label sizes its own text — the switch has no way to know which
   * surface it is on.
   */
  labelFontSize?: number;
  disabled?: boolean;
  style?: CSSProperties;
}

function switchTrackStyle(checked: boolean, size: number): CSSProperties {
  return {
    width: Math.round(size * 1.9),
    height: size,
    padding: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: checked ? "flex-end" : "flex-start",
    background: checked ? "var(--opg-ink)" : "var(--opg-card)",
    border: "3px solid var(--opg-ink)",
    borderRadius: 999,
  };
}

function switchKnobStyle(checked: boolean, knob: number): CSSProperties {
  return {
    width: knob,
    height: knob,
    borderRadius: "50%",
    background: checked ? "var(--opg-highlight)" : "var(--opg-ink)",
  };
}

/** On/off switch that always shows its state as text next to it. */
export function Switch({
  checked,
  onChange,
  label,
  onLabel = "On",
  offLabel = "Off",
  size = 42,
  labelFontSize = 18,
  disabled = false,
  style,
}: SwitchProps) {
  const knob = Math.round(size * 0.67);
  const hitHeight = Math.max(44, size);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        ...style,
      }}
    >
      <button
        type="button"
        role="switch"
        className={PRESSABLE_CLASS}
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onChange ? () => onChange(!checked) : undefined}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: hitHeight,
          minWidth: 44,
          padding: 0,
          background: "transparent",
          border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <span style={switchTrackStyle(checked, size)}>
          <span style={switchKnobStyle(checked, knob)} />
        </span>
      </button>
      <span style={{ fontSize: labelFontSize, fontWeight: 700 }}>
        {checked ? onLabel : offLabel}
      </span>
    </div>
  );
}

export interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  maxLength?: number;
  id?: string;
  name?: string;
  type?: InputHTMLAttributes<HTMLInputElement>["type"];
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  hint?: string;
  error?: string;
  style?: CSSProperties;
}

const INPUT_STYLE: CSSProperties = {
  height: 60,
  padding: "0 18px",
  background: "var(--opg-card)",
  border: "4px solid var(--opg-ink)",
  borderRadius: "var(--opg-radius-button)",
  fontFamily: "var(--opg-font-body)",
  fontSize: 22,
  fontWeight: 700,
  color: "var(--opg-ink)",
};

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        fontSize: 17,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--opg-ink-secondary)",
      }}
    >
      {children}
    </label>
  );
}

function FieldMessage({ error, hint }: { error?: string; hint?: string }) {
  if (error) {
    return (
      <span
        style={{ fontSize: 17, fontWeight: 700, color: "var(--opg-marker-text)" }}
      >
        {error}
      </span>
    );
  }
  if (hint) {
    return (
      <span style={{ fontSize: 17, color: "var(--opg-ink-secondary)" }}>
        {hint}
      </span>
    );
  }
  return null;
}

export function TextInput({
  value,
  onChange,
  label,
  placeholder,
  maxLength,
  id,
  name,
  type = "text",
  inputMode,
  autoComplete,
  autoFocus,
  disabled,
  hint,
  error,
  style,
}: TextInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: "100%",
        ...style,
      }}
    >
      {label ? <FieldLabel htmlFor={inputId}>{label}</FieldLabel> : null}
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        disabled={disabled}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={INPUT_STYLE}
      />
      <FieldMessage error={error} hint={hint} />
    </div>
  );
}
