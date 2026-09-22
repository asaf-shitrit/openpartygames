// TV and phone chrome: headers, phone strip and the "you" player chip.
import type { ReactNode } from "react";
import type { AvatarId } from "@opg/protocol";
import { format, useLocale } from "@opg/i18n";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { Marker, PRESSABLE_CLASS } from "./primitives";
import { useSound } from "./audio/SoundProvider";
import type { SoundStatus } from "./audio/types";
import { useFullscreen } from "./screen";

function RoomChip({
  code,
  height,
  fontSize,
}: {
  code: string;
  height: number;
  fontSize: number;
}) {
  const { t } = useLocale();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        height,
        padding: `0 ${Math.round(height * 0.38)}px`,
        background: "var(--opg-card)",
        border: "4px solid var(--opg-ink)",
        borderRadius: "var(--opg-radius-button)",
        fontSize,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontWeight: 400, color: "var(--opg-ink-secondary)" }}>
        {t.kit.room}
      </span>
      <span style={{ fontWeight: 700 }}>{code}</span>
    </div>
  );
}

export interface HeaderChipProps {
  icon: IconName;
  label: string;
  onClick: () => void;
  /** Sets aria-pressed for toggle chips; omit for plain action chips. */
  pressed?: boolean;
  /** Default 68. */
  height?: number;
  /** Default 28. */
  fontSize?: number;
}

/** Rounded, bordered chip button used in the TV header's right-hand cluster. */
export function HeaderChip({
  icon,
  label,
  onClick,
  pressed,
  height = 68,
  fontSize = 28,
}: HeaderChipProps) {
  return (
    <button
      type="button"
      className={`opg-reset ${PRESSABLE_CLASS}`}
      onClick={onClick}
      aria-pressed={pressed}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        height,
        padding: `0 ${Math.round(height * 0.4)}px`,
        background: "var(--opg-card)",
        border: "4px solid var(--opg-ink)",
        borderRadius: "var(--opg-radius-button)",
        fontSize,
        fontWeight: 700,
        color: "var(--opg-ink)",
      }}
    >
      <Icon name={icon} size={Math.round(height * 0.5)} />
      <span>{label}</span>
    </button>
  );
}

interface SoundChipCopy {
  icon: IconName;
  label: string;
}

/** "Tap for sound" until the browser unlocks the audio context, then the mute toggle. */
function soundChipCopy(
  status: SoundStatus,
  muted: boolean,
  t: ReturnType<typeof useLocale>["t"],
): SoundChipCopy {
  if (muted) return { icon: "sound-off", label: t.kit.sound.off };
  if (status === "locked") return { icon: "sound-off", label: t.kit.sound.tapForSound };
  return { icon: "sound", label: t.kit.sound.on };
}

function SoundChip({ height, fontSize }: { height: number; fontSize: number }) {
  const sound = useSound();
  const { t } = useLocale();
  const copy = soundChipCopy(sound.status, sound.muted, t);
  function onClick(): void {
    // The click is a user gesture, so a locked context resumes here whatever the mute state.
    if (sound.status === "locked") sound.unlock();
    if (sound.muted || sound.status !== "locked") sound.toggleMuted();
  }
  return (
    <HeaderChip
      icon={copy.icon}
      label={copy.label}
      onClick={onClick}
      pressed={!sound.muted}
      height={height}
      fontSize={fontSize}
    />
  );
}

function FullscreenChip({
  height,
  fontSize,
}: {
  height: number;
  fontSize: number;
}) {
  const { supported, active, enter } = useFullscreen();
  const { t } = useLocale();
  if (!supported || active) return null;
  return (
    <HeaderChip
      icon="expand"
      label={t.kit.fullScreen}
      onClick={enter}
      height={height}
      fontSize={fontSize}
    />
  );
}

function HeaderChips({
  roomCode,
  actions,
}: {
  roomCode?: string;
  actions?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      {actions}
      {roomCode ? <RoomChip code={roomCode} height={68} fontSize={28} /> : null}
      <FullscreenChip height={68} fontSize={28} />
      <SoundChip height={68} fontSize={28} />
    </div>
  );
}

export interface TvHeaderProps {
  variant: "brand" | "game";
  /** Shown as a "Room CODE" chip when present. */
  roomCode?: string;
  /** Required for variant "game". */
  gameName?: string;
  /** e.g. "Word 3 of 6" or "Final scores". */
  progress?: string;
  /** Extra controls shown before the header chips, e.g. an app-level help chip. */
  actions?: ReactNode;
}

export function TvHeader({
  variant,
  roomCode,
  gameName,
  progress,
  actions,
}: TvHeaderProps) {
  if (variant === "brand") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ position: "relative", padding: "0 8px" }}>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 6,
              height: 26,
              background: "var(--opg-highlight)",
              borderRadius: 6,
              transform: "rotate(-1deg)",
            }}
          />
          <div
            className="opg-marker"
            style={{ position: "relative", fontSize: 56, lineHeight: 1.1 }}
          >
            OpenPartyGames
          </div>
        </div>
        <HeaderChips roomCode={roomCode} actions={actions} />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Marker size={52}>{gameName ?? ""}</Marker>
        {progress ? (
          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              color: "var(--opg-ink-secondary)",
            }}
          >
            {progress}
          </div>
        ) : null}
      </div>
      <HeaderChips roomCode={roomCode} actions={actions} />
    </div>
  );
}

export interface PhoneStripProps {
  gameName: string;
  progress?: string;
  /** Right slot, e.g. a Timer. */
  right?: ReactNode;
  /**
   * Shown as a small "Room CODE" line when set — a no-TV room's rejoin path, so anyone can read
   * the code out to a player whose phone died without pausing the game. Omit on a shared screen.
   */
  roomCode?: string;
}

/** Phone in-game top strip: game name, progress, an optional room code, and the timer. */
export function PhoneStrip({ gameName, progress, right, roomCode }: PhoneStripProps) {
  const { t } = useLocale();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          minWidth: 0,
        }}
      >
        <div className="opg-marker" style={{ fontSize: 30, lineHeight: 1.1 }}>
          {gameName}
        </div>
        {progress ? (
          <div style={{ fontSize: 17, fontWeight: 700, color: "#4A4A4A" }}>
            {progress}
          </div>
        ) : null}
        {roomCode ? (
          <div style={{ fontSize: 16, fontWeight: 700, color: "#8A8A8A" }}>
            {format(t.kit.roomCode, { code: roomCode })}
          </div>
        ) : null}
      </div>
      {right}
    </div>
  );
}

export interface PlayerChipProps {
  name: string;
  avatar: AvatarId | null;
  size?: number;
}

/** Phone bottom "you" chip: avatar + name. */
export function PlayerChip({ name, avatar, size = 50 }: PlayerChipProps) {
  const { t } = useLocale();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Avatar
        id={avatar}
        size={size}
        alt={avatar ? format(t.kit.playerAvatarAlt, { name }) : undefined}
      />
      <div style={{ fontSize: 21, fontWeight: 700 }}>{name}</div>
    </div>
  );
}
