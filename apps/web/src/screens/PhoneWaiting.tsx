// design/PhoneWaitingNextGame.dc.html — joined mid-game; waits for the next one.
import type { PlayerSummary, PlayerRoomView } from "@opg/protocol";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import {
  Avatar,
  Card,
  Highlight,
  Marker,
  PhoneScreen,
  PhoneStrip,
  StickyNote,
} from "@opg/ui";

function WaitingNote({ t }: { t: Dictionary }) {
  return (
    <StickyNote
      style={{
        margin: "0 6px",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3 }}>
        {t.status.waitingHeading}
      </div>
      <div style={{ fontSize: 18, lineHeight: 1.3 }}>{t.status.waitingBody}</div>
    </StickyNote>
  );
}

function WaitingPlayerCard({
  player,
  isYou,
  alt,
  t,
}: {
  player: PlayerSummary;
  isYou: boolean;
  alt: boolean;
  t: Dictionary;
}) {
  return (
    <Card
      variant={alt ? "M" : "Malt"}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: "10px 6px 8px",
        borderWidth: 3,
      }}
    >
      <Avatar id={player.avatar} size={48} />
      <div
        style={{
          fontSize: 17,
          fontWeight: 700,
          textAlign: "center",
          lineHeight: 1.15,
        }}
      >
        {player.name}
        {isYou ? t.status.youSuffix : ""}
      </div>
    </Card>
  );
}

function findMe(view: PlayerRoomView): PlayerSummary | null {
  return view.players.find((p) => p.id === view.you) ?? null;
}

function meName(me: PlayerSummary | null, t: Dictionary): string {
  return me?.name ?? t.status.playerFallback;
}

function meAvatar(me: PlayerSummary | null): PlayerSummary["avatar"] {
  return me?.avatar ?? null;
}

function waitingGameName(view: PlayerRoomView, t: Dictionary): string {
  return (
    view.games.find((g) => g.id === view.game?.id)?.name ?? t.status.gameFallback
  );
}

function WaitingHeader({
  name,
  avatar,
  t,
}: {
  name: string;
  avatar: PlayerSummary["avatar"];
  t: Dictionary;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        marginTop: 8,
      }}
    >
      <Highlight style={{ padding: "0 10px" }}>
        <Marker size={38} style={{ lineHeight: 1.15 }}>
          {format(t.status.youreIn, { name })}
        </Marker>
      </Highlight>
      <Avatar id={avatar} size={150} />
    </div>
  );
}

function PlayersSection({
  players,
  you,
  t,
}: {
  players: PlayerSummary[];
  you: string;
  t: Dictionary;
}) {
  return (
    <div
      style={{
        marginTop: 8,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 19, fontWeight: 700 }}>
        {format(t.status.whosPlaying, { count: players.length })}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {players.map((player, index) => (
          <WaitingPlayerCard
            key={player.id}
            player={player}
            isYou={player.id === you}
            alt={index % 2 === 0}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

export function PhoneWaiting({ view }: { view: PlayerRoomView }) {
  const { t } = useLocale();
  const me = findMe(view);

  return (
    <PhoneScreen>
      <PhoneStrip
        gameName={waitingGameName(view, t)}
        progress={t.status.inProgress}
        roomCode={view.sharedScreen ? undefined : view.code}
      />

      <WaitingHeader name={meName(me, t)} avatar={meAvatar(me)} t={t} />

      <WaitingNote t={t} />

      <PlayersSection players={view.players} you={view.you} t={t} />
    </PhoneScreen>
  );
}
