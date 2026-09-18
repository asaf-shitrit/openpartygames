// design/PhoneWaitingNextGame.dc.html — joined mid-game; waits for the next one.
import type { PlayerSummary, PlayerRoomView } from "@opg/protocol";
import {
  Avatar,
  Card,
  Highlight,
  Marker,
  PhoneScreen,
  PhoneStrip,
  StickyNote,
} from "@opg/ui";

function WaitingNote() {
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
        A game is already running. You'll join when the next one starts.
      </div>
      <div style={{ fontSize: 18, lineHeight: 1.3 }}>
        Hang tight until then.
      </div>
    </StickyNote>
  );
}

function WaitingPlayerCard({
  player,
  isYou,
  alt,
}: {
  player: PlayerSummary;
  isYou: boolean;
  alt: boolean;
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
        {isYou ? " (you)" : ""}
      </div>
    </Card>
  );
}

function findMe(view: PlayerRoomView): PlayerSummary | null {
  return view.players.find((p) => p.id === view.you) ?? null;
}

function meName(me: PlayerSummary | null): string {
  return me?.name ?? "player";
}

function meAvatar(me: PlayerSummary | null): PlayerSummary["avatar"] {
  return me?.avatar ?? null;
}

function waitingGameName(view: PlayerRoomView): string {
  return view.games.find((g) => g.id === view.game?.id)?.name ?? "Game";
}

function WaitingHeader({
  name,
  avatar,
}: {
  name: string;
  avatar: PlayerSummary["avatar"];
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
          You're in, {name}!
        </Marker>
      </Highlight>
      <Avatar id={avatar} size={150} />
    </div>
  );
}

function PlayersSection({
  players,
  you,
}: {
  players: PlayerSummary[];
  you: string;
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
        Who's playing ({players.length})
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
          />
        ))}
      </div>
    </div>
  );
}

export function PhoneWaiting({ view }: { view: PlayerRoomView }) {
  const me = findMe(view);

  return (
    <PhoneScreen>
      <PhoneStrip
        gameName={waitingGameName(view)}
        progress="In progress"
        roomCode={view.sharedScreen ? undefined : view.code}
      />

      <WaitingHeader name={meName(me)} avatar={meAvatar(me)} />

      <WaitingNote />

      <PlayersSection players={view.players} you={view.you} />
    </PhoneScreen>
  );
}
