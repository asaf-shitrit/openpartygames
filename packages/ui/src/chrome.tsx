// TV and phone chrome: headers, phone strip and the "you" player chip.
import type { ReactNode } from "react";
import type { AvatarId } from "@opg/protocol";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { Marker } from "./primitives";
import { useSoundSetting } from "./clock";

function RoomChip({
  code,
  height,
  fontSize,
}: {
  code: string;
  height: number;
  fontSize: number;
}) {
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
        Room
      </span>
      <span style={{ fontWeight: 700 }}>{code}</span>
    </div>
  );
}

function SoundChip({ height, fontSize }: { height: number; fontSize: number }) {
  const { muted, toggle } = useSoundSetting();
  return (
    <button
      type="button"
      className="opg-reset"
      onClick={toggle}
      aria-pressed={!muted}
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
      <Icon
        name={muted ? "sound-off" : "sound"}
        size={Math.round(height * 0.5)}
      />
      <span>{muted ? "Sound off" : "Sound on"}</span>
    </button>
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
}

export function TvHeader({
  variant,
  roomCode,
  gameName,
  progress,
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
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {roomCode ? (
            <RoomChip code={roomCode} height={68} fontSize={28} />
          ) : null}
          <SoundChip height={68} fontSize={28} />
        </div>
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
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {roomCode ? (
          <RoomChip code={roomCode} height={68} fontSize={28} />
        ) : null}
        <SoundChip height={68} fontSize={28} />
      </div>
    </div>
  );
}

export interface PhoneStripProps {
  gameName: string;
  progress?: string;
  /** Right slot, e.g. a Timer. */
  right?: ReactNode;
}

/** Phone in-game top strip: game name, progress, and the timer. */
export function PhoneStrip({ gameName, progress, right }: PhoneStripProps) {
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
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Avatar
        id={avatar}
        size={size}
        alt={avatar ? `${name}'s avatar` : undefined}
      />
      <div style={{ fontSize: 21, fontWeight: 700 }}>{name}</div>
    </div>
  );
}
