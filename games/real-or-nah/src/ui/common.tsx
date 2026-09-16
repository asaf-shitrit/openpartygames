// Shared bits for the Real or Nah host and phone screens.
import type { CSSProperties, ReactNode } from "react";
import type {
        AvatarId,
        HostRoomView,
        PlayerId,
        PlayerRoomView,
        PlayerSummary,
} from "@opg/protocol";
import { Avatar } from "@opg/ui";

type Room = HostRoomView | PlayerRoomView;

export function playerFor(room: Room, id: PlayerId): PlayerSummary | undefined {
        return room.players.find((p) => p.id === id);
}

/** Looks a player up directly in a roster, for components that only get `players`. */
export function findPlayer(
        players: PlayerSummary[],
        id: PlayerId | null,
): PlayerSummary | null {
        if (!id) return null;
        return players.find((player) => player.id === id) ?? null;
}

export function nameOf(players: PlayerSummary[], id: PlayerId | null): string {
        return findPlayer(players, id)?.name ?? id ?? "Someone";
}

export function avatarOf(
        players: PlayerSummary[],
        id: PlayerId | null,
): AvatarId | null {
        return findPlayer(players, id)?.avatar ?? null;
}

export interface PersonTagProps {
        name: string;
        avatar: AvatarId | null;
        avatarSize?: number;
        fontSize?: number;
        children?: ReactNode;
}

/** Avatar + name, always labelled so the avatar is not the only cue. */
export function PersonTag({
        name,
        avatar,
        avatarSize = 52,
        fontSize = 30,
        children,
}: PersonTagProps) {
        return (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar
                                id={avatar}
                                size={avatarSize}
                                alt={`${name}'s avatar`}
                        />
                        <div style={{ fontSize, fontWeight: 700 }}>{name}</div>
                        {children}
                </div>
        );
}

export interface PersonProps {
        room: Room;
        id: PlayerId;
        avatarSize?: number;
        fontSize?: number;
}

export function playerName(player: PlayerSummary | undefined): string {
        return player?.name ?? "Player";
}

export function playerAvatar(
        player: PlayerSummary | undefined,
): AvatarId | null {
        return player?.avatar ?? null;
}

export function Person({ room, id, avatarSize, fontSize }: PersonProps) {
        const player = playerFor(room, id);
        return (
                <PersonTag
                        name={playerName(player)}
                        avatar={playerAvatar(player)}
                        avatarSize={avatarSize}
                        fontSize={fontSize}
                />
        );
}

export interface BlankProps {
        width: number;
        height: number;
        thickness?: number;
        verticalAlign?: string;
}

/** The hand-drawn "____" underline from the designs. */
export function Blank({
        width,
        height,
        thickness = 7,
        verticalAlign = "-6px",
}: BlankProps) {
        return (
                <svg
                        width={width}
                        height={height}
                        viewBox="0 0 300 28"
                        aria-hidden="true"
                        focusable="false"
                        style={{ verticalAlign }}
                >
                        <path
                                d="M6 18c56-7 118 3 178-3s74 5 110-1"
                                fill="none"
                                stroke="#2B2B2B"
                                strokeWidth={thickness}
                                strokeLinecap="round"
                        />
                </svg>
        );
}

function splitBlank(text: string): [string, string] {
        const at = text.indexOf("____");
        if (at < 0) return [text, ""];
        return [text.slice(0, at), text.slice(at + 4)];
}

export interface PromptTextProps {
        prompt: string;
        /** Renders the blank as this answer instead of an underline. */
        answer?: string | null;
        blank?: BlankProps;
        style?: CSSProperties;
}

function BlankSlot({
        answer,
        blank,
}: {
        answer?: string | null;
        blank?: BlankProps;
}) {
        if (answer) return <span style={{ fontWeight: 700 }}>{answer}</span>;
        if (blank) return <Blank {...blank} />;
        return null;
}

/** The fact prompt with its "____" blank drawn as an underline or the answer. */
export function PromptText({ prompt, answer, blank, style }: PromptTextProps) {
        const [before, after] = splitBlank(prompt);
        return (
                <div style={{ whiteSpace: "pre-wrap", ...style }}>
                        {before}
                        <BlankSlot answer={answer} blank={blank} />
                        {after}
                </div>
        );
}
