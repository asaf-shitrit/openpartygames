// design/PhoneLobby.dc.html — non-VIP lobby.
import type { PlayerSummary, PlayerRoomView } from "@opg/protocol";
import {
  Avatar,
  Card,
  Highlight,
  Icon,
  Marker,
  PhoneScreen,
  StickyNote,
  Tally,
  Tape,
} from "@opg/ui";

export interface PhoneLobbyProps {
  view: PlayerRoomView;
  onChangeAvatar?: () => void;
  onLeave?: () => void;
}

function PlayerBadge({ player }: { player: PlayerSummary }) {
  if (player.isVip) {
    return (
      <div
        className="opg-marker"
        style={{ fontSize: 17, lineHeight: 1, color: "var(--opg-marker)" }}
      >
        VIP
      </div>
    );
  }
  if (player.crowns > 0) return <Tally count={player.crowns} size={22} />;
  return null;
}

function PlayerCell({
  player,
  isYou,
}: {
  player: PlayerSummary;
  isYou: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        padding: "6px 4px",
        background: isYou ? "var(--opg-highlight-soft)" : undefined,
        borderRadius: "var(--opg-radius-m)",
      }}
    >
      <Avatar id={player.avatar} size={52} />
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
      <div
        style={{ height: 22, display: "flex", alignItems: "center", gap: 3 }}
      >
        <PlayerBadge player={player} />
      </div>
    </div>
  );
}

function ChangeDoodleButton({
  onChangeAvatar,
}: {
  onChangeAvatar: () => void;
}) {
  return (
    <button
      type="button"
      className="opg-reset"
      onClick={onChangeAvatar}
      style={{
        height: 48,
        padding: "0 14px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "var(--opg-card)",
        border: "4px solid var(--opg-ink)",
        borderRadius: "var(--opg-radius-button)",
        fontSize: 18,
        fontWeight: 700,
      }}
    >
      <Icon name="pencil" size={20} />
      <span>Change doodle</span>
    </button>
  );
}

function findMe(view: PlayerRoomView): PlayerSummary | null {
  return view.players.find((p) => p.id === view.you) ?? null;
}

function findVip(view: PlayerRoomView): PlayerSummary | null {
  return view.players.find((p) => p.id === view.vipId) ?? null;
}

function vipLabel(vip: PlayerSummary | null): string {
  return vip?.name ?? "The VIP";
}

function isVipYou(vip: PlayerSummary | null, you: string): boolean {
  return vip?.id === you;
}

function YouCardTitle({ me }: { me: PlayerSummary | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>
        {me?.name ?? "You"}
      </div>
      {me && me.crowns > 0 ? <Tally count={me.crowns} size={28} /> : null}
    </div>
  );
}

function YouCard({
  me,
  onChangeAvatar,
}: {
  me: PlayerSummary | null;
  onChangeAvatar?: () => void;
}) {
  return (
    <Card
      variant="L"
      tilt={-1}
      style={{
        marginTop: 6,
        padding: 18,
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <Tape right={40} top={-18} width={120} height={36} rotate={-3} />
      <Avatar id={me?.avatar ?? null} size={96} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <YouCardTitle me={me} />
        {onChangeAvatar ? (
          <ChangeDoodleButton onChangeAvatar={onChangeAvatar} />
        ) : null}
      </div>
    </Card>
  );
}

function VipNote({ vipName, isYou }: { vipName: string; isYou: boolean }) {
  const line = isYou
    ? "You're the VIP and pick the game."
    : `${vipName} is the VIP and picks the game. Watch the TV.`;
  return (
    <StickyNote
      tilt={1}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
      }}
    >
      <Icon name="monitor" size={30} />
      <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.35 }}>
        {line}
      </div>
    </StickyNote>
  );
}

function LeaveButton({ onLeave }: { onLeave: () => void }) {
  return (
    <button
      type="button"
      className="opg-reset"
      onClick={onLeave}
      style={{
        marginTop: "auto",
        alignSelf: "center",
        height: 48,
        padding: "0 12px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 18,
        fontWeight: 700,
        color: "var(--opg-ink-secondary)",
      }}
    >
      <Icon name="kick" size={22} color="var(--opg-ink-secondary)" />
      <span style={{ textDecoration: "underline", textUnderlineOffset: 4 }}>
        Leave room
      </span>
    </button>
  );
}

function LobbyBody({
  players,
  you,
}: {
  players: PlayerSummary[];
  you: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 10,
      }}
    >
      {players.map((player) => (
        <PlayerCell key={player.id} player={player} isYou={player.id === you} />
      ))}
    </div>
  );
}

export function PhoneLobby({ view, onChangeAvatar, onLeave }: PhoneLobbyProps) {
  const me = findMe(view);
  const vip = findVip(view);

  return (
    <PhoneScreen>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Highlight style={{ alignSelf: "flex-start", padding: "0 10px" }}>
          <Marker size={40} style={{ lineHeight: 1.15 }}>
            You're in!
          </Marker>
        </Highlight>
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: "var(--opg-ink-secondary)",
          }}
        >
          Room {view.code}
        </div>
      </div>

      <YouCard me={me} onChangeAvatar={onChangeAvatar} />

      <VipNote vipName={vipLabel(vip)} isYou={isVipYou(vip, view.you)} />

      <Marker size={28} style={{ lineHeight: 1.15 }}>
        Who's here ({view.players.length})
      </Marker>

      <LobbyBody players={view.players} you={view.you} />

      {onLeave ? <LeaveButton onLeave={onLeave} /> : null}
    </PhoneScreen>
  );
}
