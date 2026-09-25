// design/PhoneLobby.dc.html, design/PhoneNoTvLobbyPlayer.dc.html — non-VIP lobby.
import type { GameSummary, PlayerSummary, PlayerRoomView } from "@opg/protocol";
import {
  Avatar,
  Card,
  Highlight,
  Icon,
  Marker,
  PhoneScreen,
  PRESSABLE_CLASS,
  StickyNote,
  Tally,
  Tape,
} from "@opg/ui";
import { format, joinNamesOr, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { gameIconFor } from "../games";

export interface PhoneLobbyProps {
  view: PlayerRoomView;
  onChangeAvatar?: () => void;
  onLeave?: () => void;
}

function PlayerBadge({ player, t }: { player: PlayerSummary; t: Dictionary }) {
  if (player.isVip) {
    return (
      <div
        className="opg-marker"
        style={{ fontSize: 17, lineHeight: 1, color: "var(--opg-marker-text)" }}
      >
        {t.lobby.vip}
      </div>
    );
  }
  if (player.crowns > 0) return <Tally count={player.crowns} size={22} />;
  return null;
}

function PlayerCell({
  player,
  isYou,
  t,
}: {
  player: PlayerSummary;
  isYou: boolean;
  t: Dictionary;
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
        {isYou ? t.lobby.youSuffix : ""}
      </div>
      <div
        style={{ height: 22, display: "flex", alignItems: "center", gap: 3 }}
      >
        <PlayerBadge player={player} t={t} />
      </div>
    </div>
  );
}

function ChangeDoodleButton({
  onChangeAvatar,
  t,
}: {
  onChangeAvatar: () => void;
  t: Dictionary;
}) {
  return (
    <button
      type="button"
      className={`opg-reset ${PRESSABLE_CLASS}`}
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
      <span>{t.lobby.changeDoodle}</span>
    </button>
  );
}

function findMe(view: PlayerRoomView): PlayerSummary | null {
  return view.players.find((p) => p.id === view.you) ?? null;
}

function findVip(view: PlayerRoomView): PlayerSummary | null {
  return view.players.find((p) => p.id === view.vipId) ?? null;
}

function vipLabel(vip: PlayerSummary | null, t: Dictionary): string {
  return vip?.name ?? t.lobby.theVip;
}

function isVipYou(vip: PlayerSummary | null, you: string): boolean {
  return vip?.id === you;
}

function YouCardTitle({ me, t }: { me: PlayerSummary | null; t: Dictionary }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        rowGap: 4,
        columnGap: 10,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 30,
          fontWeight: 700,
          lineHeight: 1.1,
          minWidth: 0,
          overflowWrap: "break-word",
        }}
      >
        {me?.name ?? t.lobby.you}
      </div>
      {me && me.crowns > 0 ? <Tally count={me.crowns} size={28} /> : null}
    </div>
  );
}

function YouCard({
  me,
  onChangeAvatar,
  t,
}: {
  me: PlayerSummary | null;
  onChangeAvatar?: () => void;
  t: Dictionary;
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
          minWidth: 0,
        }}
      >
        <YouCardTitle me={me} t={t} />
        {onChangeAvatar ? (
          <ChangeDoodleButton onChangeAvatar={onChangeAvatar} t={t} />
        ) : null}
      </div>
    </Card>
  );
}

function vipNoteLine(
  t: Dictionary,
  vipName: string,
  isYou: boolean,
  sharedScreen: boolean,
): string {
  if (isYou) return t.lobby.vipYouNote;
  const picks = format(t.lobby.vipPicksNote, { name: vipName });
  if (sharedScreen) return `${picks} ${t.lobby.watchTv}`;
  return picks;
}

function VipNote({
  vipName,
  isYou,
  sharedScreen,
  t,
}: {
  vipName: string;
  isYou: boolean;
  sharedScreen: boolean;
  t: Dictionary;
}) {
  const line = vipNoteLine(t, vipName, isYou, sharedScreen);
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

function selectedGame(view: PlayerRoomView): GameSummary | null {
  return view.games.find((g) => g.id === view.selectedGameId) ?? null;
}

function alternativeNames(view: PlayerRoomView, exceptId: string): string[] {
  return view.games
    .filter((g) => g.noTv && g.id !== exceptId)
    .map((g) => g.name);
}

function escapeLine(t: Dictionary, vipName: string, altNames: string[]): string {
  if (altNames.length === 0) return format(t.lobby.escapeNoAlt, { name: vipName });
  return format(t.lobby.escapeWithAlt, {
    name: vipName,
    names: joinNamesOr(t.common, altNames),
  });
}

function BlockedReason({ t }: { t: Dictionary }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        background: "var(--opg-paper)",
        border: "4px solid var(--opg-marker)",
        borderRadius: "var(--opg-radius-l)",
      }}
    >
      <Icon name="monitor" size={22} color="var(--opg-marker)" />
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          // 18px bold is just under WCAG's 18.66px "large text", so this is body text.
          color: "var(--opg-marker-text)",
          lineHeight: 1.3,
        }}
      >
        {t.lobby.playsOnSharedScreen}
      </div>
    </div>
  );
}

function GameCard({ game, t }: { game: GameSummary; t: Dictionary }) {
  return (
    <Card
      variant="L"
      tilt={-1}
      style={{
        padding: "18px 18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <Marker size={26} style={{ lineHeight: 1.1 }}>
          {game.name}
        </Marker>
        <Icon name={gameIconFor(game.id)} size={40} />
      </div>
      <div style={{ fontSize: 17, lineHeight: 1.35 }}>{game.blurb}</div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "var(--opg-ink-secondary)",
        }}
      >
        {format(t.lobby.playersRange, {
          min: game.minPlayers,
          max: game.maxPlayers,
          minutes: game.minutes,
        })}
      </div>
    </Card>
  );
}

function SelectedGameSection({
  view,
  vipName,
  t,
}: {
  view: PlayerRoomView;
  vipName: string;
  t: Dictionary;
}) {
  const game = selectedGame(view);
  if (!game) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Marker size={22} style={{ lineHeight: 1.15 }}>
        {format(t.lobby.picked, { name: vipName })}
      </Marker>
      <GameCard game={game} t={t} />
      {game.noTv ? null : (
        <>
          <BlockedReason t={t} />
          <div
            style={{
              fontSize: 16,
              lineHeight: 1.35,
              color: "var(--opg-ink-secondary)",
            }}
          >
            {escapeLine(t, vipName, alternativeNames(view, game.id))}
          </div>
        </>
      )}
    </div>
  );
}

function LeaveButton({ onLeave, t }: { onLeave: () => void; t: Dictionary }) {
  return (
    <button
      type="button"
      className={`opg-reset ${PRESSABLE_CLASS}`}
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
        {t.lobby.leaveRoom}
      </span>
    </button>
  );
}

function LobbyBody({
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
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 10,
      }}
    >
      {players.map((player) => (
        <PlayerCell key={player.id} player={player} isYou={player.id === you} t={t} />
      ))}
    </div>
  );
}

export function PhoneLobby({ view, onChangeAvatar, onLeave }: PhoneLobbyProps) {
  const { t } = useLocale();
  const me = findMe(view);
  const vip = findVip(view);

  return (
    <PhoneScreen>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Highlight style={{ alignSelf: "flex-start", padding: "0 10px" }}>
          <Marker size={40} style={{ lineHeight: 1.15 }}>
            {t.lobby.youreIn}
          </Marker>
        </Highlight>
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: "var(--opg-ink-secondary)",
          }}
        >
          {format(t.lobby.room, { code: view.code })}
        </div>
      </div>

      <YouCard me={me} onChangeAvatar={onChangeAvatar} t={t} />

      <VipNote
        vipName={vipLabel(vip, t)}
        isYou={isVipYou(vip, view.you)}
        sharedScreen={view.sharedScreen}
        t={t}
      />

      {view.sharedScreen ? null : (
        <SelectedGameSection view={view} vipName={vipLabel(vip, t)} t={t} />
      )}

      <Marker size={28} style={{ lineHeight: 1.15 }}>
        {format(t.lobby.whosHere, { count: view.players.length })}
      </Marker>

      <LobbyBody players={view.players} you={view.you} t={t} />

      {onLeave ? <LeaveButton onLeave={onLeave} t={t} /> : null}
    </PhoneScreen>
  );
}
