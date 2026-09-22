// design/PhoneVIPControls.dc.html — VIP lobby controls.
import type {
  GameSummary,
  PackSummary,
  PlayerSummary,
  PlayerRoomView,
  Rating,
} from "@opg/protocol";
import { useState } from "react";
import {
  Avatar,
  Button,
  Card,
  Chip,
  Highlight,
  Icon,
  Marker,
  PhoneScreen,
  PRESSABLE_CLASS,
  Switch,
} from "@opg/ui";
import { format, joinNamesOr, pickPluralByCount, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { QrCode } from "./shared";
import { gameIconFor } from "../games";

export interface PhoneVipControlsProps {
  view: PlayerRoomView;
  error?: string | null;
  onPickGame: (gameId: string) => void;
  onSetPack: (packId: string, enabled: boolean) => void;
  onSetLocked: (locked: boolean) => void;
  onSetSharedScreen: (sharedScreen: boolean) => void;
  onKick: (playerId: string) => void;
  onStartGame: () => void;
}

function ratingLabel(t: Dictionary, rating: Rating): string {
  if (rating === "adult") return t.picker.ratingAdult;
  if (rating === "teen") return t.picker.ratingTeen;
  return t.picker.ratingFamily;
}

/** A game that has not opted into a room with no shared screen. */
function isBlocked(game: GameSummary, sharedScreen: boolean): boolean {
  return !game.noTv && !sharedScreen;
}

interface DisabledCheck {
  t: Dictionary;
  selectedGame: GameSummary | null;
  sharedScreen: boolean;
  playerCount: number;
  packCount: number;
}

function startDisabledReason(check: DisabledCheck): string | undefined {
  const { t, selectedGame, sharedScreen, playerCount, packCount } = check;
  if (!selectedGame) return t.picker.pickGameFirst;
  if (isBlocked(selectedGame, sharedScreen)) {
    return format(t.picker.gameNeedsSharedScreen, { game: selectedGame.name });
  }
  if (playerCount < selectedGame.minPlayers) {
    return format(t.picker.needAtLeastPlayers, {
      count: selectedGame.minPlayers,
    });
  }
  if (packCount === 0) return t.picker.turnOnPack;
  return undefined;
}

function PlayerRow({
  t,
  player,
  isYou,
  onKick,
}: {
  t: Dictionary;
  player: PlayerSummary;
  isYou: boolean;
  onKick: (id: string) => void;
}) {
  return (
    <div style={{ height: 50, display: "flex", alignItems: "center", gap: 10 }}>
      <Avatar id={player.avatar} size={36} />
      <div style={{ flexGrow: 1, fontSize: 19, fontWeight: 700 }}>
        {player.name}
        {player.isVip ? t.picker.vipSuffix : ""}
      </div>
      {isYou ? (
        <div
          style={{
            padding: "0 6px",
            fontSize: 16,
            fontWeight: 700,
            color: "var(--opg-ink-secondary)",
          }}
        >
          {t.picker.you}
        </div>
      ) : (
        <Button
          size="md"
          variant="secondary"
          onClick={() => onKick(player.id)}
          aria-label={format(t.picker.kickAriaLabel, { name: player.name })}
        >
          <span>{t.picker.kick}</span>
        </Button>
      )}
    </div>
  );
}

function GameButtonReason({
  t,
  blocked,
}: {
  t: Dictionary;
  blocked: boolean;
}) {
  if (!blocked) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 1.25,
      }}
    >
      <Icon name="monitor" size={18} />
      <div>{t.picker.sharedScreenOnly}</div>
    </div>
  );
}

function GameButton({
  t,
  game,
  selected,
  blocked,
  onPick,
}: {
  t: Dictionary;
  game: GameSummary;
  selected: boolean;
  blocked: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`opg-reset ${PRESSABLE_CLASS}`}
      onClick={() => onPick(game.id)}
      aria-pressed={selected}
      style={{
        padding: "10px 12px 12px",
        // Fill the cell the equal-height grid hands out.
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        textAlign: "start",
        opacity: blocked ? 0.45 : 1,
        background: selected ? "var(--opg-highlight-soft)" : "var(--opg-card)",
        border: selected
          ? "4px solid var(--opg-ink)"
          : "3px solid var(--opg-ink)",
        borderRadius: selected
          ? "var(--opg-radius-m)"
          : "var(--opg-radius-m-alt)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Icon name={gameIconFor(game.id)} size={40} />
        {selected ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              fontSize: 16,
              fontWeight: 700,
              color: "var(--opg-marker)",
            }}
          >
            <Icon name="check" size={22} color="var(--opg-marker)" />
            <div>{t.picker.picked}</div>
          </div>
        ) : null}
      </div>
      <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25 }}>
        {game.name}
      </div>
      <div
        style={{
          fontSize: 16,
          lineHeight: 1.25,
          color: "var(--opg-ink-secondary)",
        }}
      >
        {format(t.picker.aboutMinutes, { minutes: game.minutes })}
      </div>
      <GameButtonReason t={t} blocked={blocked} />
    </button>
  );
}

function GamePicker({
  t,
  games,
  selectedGameId,
  sharedScreen,
  onPickGame,
}: {
  t: Dictionary;
  games: GameSummary[];
  selectedGameId: string;
  sharedScreen: boolean;
  onPickGame: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Marker size={24} style={{ lineHeight: 1.15 }}>
        {t.picker.pickAGame}
      </Marker>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          // Equal rows, so a tile carrying a blocked reason does not make its
          // neighbour look like a different kind of thing.
          gridAutoRows: "1fr",
          gap: 12,
        }}
      >
        {games.map((game) => (
          <GameButton
            key={game.id}
            t={t}
            game={game}
            selected={game.id === selectedGameId}
            blocked={isBlocked(game, sharedScreen)}
            onPick={onPickGame}
          />
        ))}
      </div>
    </div>
  );
}

function PackRow({
  t,
  pack,
  last,
  onSetPack,
}: {
  t: Dictionary;
  pack: PackSummary;
  last: boolean;
  onSetPack: (id: string, enabled: boolean) => void;
}) {
  return (
    <div
      style={{
        height: 46,
        display: "flex",
        alignItems: "center",
        gap: 10,
        borderBottom: last ? undefined : "2px dashed var(--opg-muted)",
      }}
    >
      <div
        style={{
          flexGrow: 1,
          fontSize: 17,
          fontWeight: 700,
          color: pack.enabled ? "var(--opg-ink)" : "var(--opg-ink-secondary)",
        }}
      >
        {pack.name}
      </div>
      <Chip
        height={28}
        fontSize={16}
        style={{ padding: "0 8px", borderWidth: 2 }}
      >
        {ratingLabel(t, pack.rating)}
      </Chip>
      <Switch
        checked={pack.enabled}
        size={30}
        label={`${pack.name} pack`}
        onChange={(enabled) => onSetPack(pack.id, enabled)}
      />
    </div>
  );
}

function PackList({
  t,
  packs,
  onSetPack,
}: {
  t: Dictionary;
  packs: PackSummary[];
  onSetPack: (id: string, enabled: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Marker size={24} style={{ lineHeight: 1.15 }}>
        {t.picker.packs}
      </Marker>
      <Card
        variant="M"
        style={{ padding: "0 14px", display: "flex", flexDirection: "column" }}
      >
        {packs.map((pack, index) => (
          <PackRow
            key={pack.id}
            t={t}
            pack={pack}
            last={index === packs.length - 1}
            onSetPack={onSetPack}
          />
        ))}
        {packs.length === 0 ? (
          <div
            style={{
              fontSize: 16,
              color: "var(--opg-ink-secondary)",
              padding: "14px 0",
            }}
          >
            {t.picker.noPacksYet}
          </div>
        ) : null}
      </Card>
      <div
        style={{
          fontSize: 16,
          lineHeight: 1.3,
          color: "var(--opg-ink-secondary)",
        }}
      >
        {t.picker.adultPacksNote}
      </div>
    </div>
  );
}

function sharedScreenHint(
  t: Dictionary,
  sharedScreen: boolean,
  blockedNames: string[],
): string {
  if (sharedScreen) return t.picker.sharedScreenOnRoom;
  if (blockedNames.length === 0) return t.picker.playOnTvLaptop;
  return format(t.picker.playOnTvLaptopAdds, {
    names: joinNamesOr(t.common, blockedNames),
  });
}

function SharedScreenToggle({
  t,
  sharedScreen,
  blockedNames,
  onSetSharedScreen,
}: {
  t: Dictionary;
  sharedScreen: boolean;
  blockedNames: string[];
  onSetSharedScreen: (value: boolean) => void;
}) {
  return (
    <Card
      variant="M"
      style={{
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Icon name="monitor" size={26} />
      <div
        style={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.2 }}>
          {t.picker.addSharedScreen}
        </div>
        <div
          style={{
            fontSize: 16,
            lineHeight: 1.25,
            color: "var(--opg-ink-secondary)",
          }}
        >
          {sharedScreenHint(t, sharedScreen, blockedNames)}
        </div>
      </div>
      <Switch
        checked={sharedScreen}
        size={30}
        label={t.picker.addSharedScreen}
        onChange={onSetSharedScreen}
      />
    </Card>
  );
}

function LockCard({
  t,
  locked,
  onSetLocked,
}: {
  t: Dictionary;
  locked: boolean;
  onSetLocked: (locked: boolean) => void;
}) {
  return (
    <Card
      variant="Malt"
      style={{
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Icon name="lock" size={26} />
      <div
        style={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.2 }}>
          {t.picker.lockRoom}
        </div>
        <div
          style={{
            fontSize: 16,
            lineHeight: 1.25,
            color: "var(--opg-ink-secondary)",
          }}
        >
          {t.picker.lockRoomHint}
        </div>
      </div>
      <Switch
        checked={locked}
        size={30}
        label={t.picker.lockRoom}
        onChange={(value) => onSetLocked(value)}
      />
    </Card>
  );
}

function PlayersCard({
  t,
  players,
  you,
  onKick,
}: {
  t: Dictionary;
  players: PlayerSummary[];
  you: string;
  onKick: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Marker size={24} style={{ lineHeight: 1.15 }}>
        {format(t.picker.playersHeading, { count: players.length })}
      </Marker>
      <Card
        variant="M"
        style={{ padding: "0 14px", display: "flex", flexDirection: "column" }}
      >
        {players.map((player, index) => (
          <div
            key={player.id}
            style={{
              borderBottom:
                index === players.length - 1
                  ? undefined
                  : "2px dashed var(--opg-muted)",
            }}
          >
            <PlayerRow
              t={t}
              player={player}
              isYou={player.id === you}
              onKick={onKick}
            />
          </div>
        ))}
      </Card>
    </div>
  );
}

function StartButtonError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div
      style={{
        fontSize: 16,
        fontWeight: 700,
        color: "var(--opg-marker)",
        textAlign: "center",
      }}
    >
      {error}
    </div>
  );
}

function StartButtonLabel({
  t,
  selectedGame,
}: {
  t: Dictionary;
  selectedGame: GameSummary | null;
}) {
  return (
    <span>
      {selectedGame
        ? format(t.picker.startNamedGame, { game: selectedGame.name })
        : t.picker.startGame}
    </span>
  );
}

function StartButton({
  t,
  selectedGame,
  disabledReason,
  minPlayers,
  maxPlayers,
  activeCount,
  error,
  onStartGame,
}: {
  t: Dictionary;
  selectedGame: GameSummary | null;
  disabledReason: string | undefined;
  minPlayers: number;
  maxPlayers: number;
  activeCount: number;
  error: string | null;
  onStartGame: () => void;
}) {
  return (
    <div
      style={{
        marginTop: "auto",
        // The picker, the packs and the player list together run well past a phone
        // screen, so the primary action rides the bottom of the viewport instead of
        // sitting at the end of the scroll where it cannot be reached.
        position: "sticky",
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        // Full-bleed paper behind it, since the list scrolls underneath.
        marginInline: -18,
        paddingInline: 18,
        paddingTop: 12,
        paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))",
        background: "var(--opg-paper)",
      }}
    >
      <StartButtonError error={error} />
      <Button
        size="xl"
        fullWidth
        disabled={Boolean(disabledReason)}
        disabledReason={disabledReason}
        onClick={onStartGame}
      >
        <Icon
          name="arrow-right"
          size={24}
          color="var(--opg-paper)"
        />
        <StartButtonLabel t={t} selectedGame={selectedGame} />
      </Button>
      <div
        style={{
          textAlign: "center",
          fontSize: 16,
          fontWeight: 700,
          color: "var(--opg-ink-secondary)",
        }}
      >
        {format(t.picker.playerRangeHere, {
          min: minPlayers,
          max: maxPlayers,
          count: activeCount,
        })}
      </div>
    </div>
  );
}

/** The room code as separated letters ("B · K · T · Z"), read aloud on the starter's phone. */
function RoomCodeHero({ t, code }: { t: Dictionary; code: string }) {
  return (
    <Card
      variant="L"
      style={{
        padding: "22px 10px 18px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--opg-ink-secondary)",
        }}
      >
        {t.picker.yourRoomCode}
      </div>
      <div
        className="opg-marker"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          fontSize: 48,
          lineHeight: 1,
        }}
      >
        {code.split("").map((letter, index) => (
          <span
            key={code.slice(0, index + 1)}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            {index > 0 ? (
              <span aria-hidden="true" style={{ color: "var(--opg-marker)", fontSize: 26 }}>
                ·
              </span>
            ) : null}
            <span>{letter}</span>
          </span>
        ))}
      </div>
      <JoinShare t={t} code={code} />
    </Card>
  );
}

/** A QR to scan and a link to send, for anyone not close enough to hear the code. */
function JoinShare({ t, code }: { t: Dictionary; code: string }) {
  const [copied, setCopied] = useState(false);
  const joinUrl = `${window.location.origin}/${code}`;

  function share() {
    // Feature-detected rather than assumed: a share sheet on a phone, the clipboard
    // on anything else. Both can be refused, and that is fine — the code is on screen.
    // The check is hoisted because narrowing on `navigator` itself would leave the
    // other branch unreachable, since the DOM lib declares `share` as always present.
    const canShare = "share" in navigator;
    if (canShare) {
      void navigator
        .share({ title: t.picker.shareTitle, url: joinUrl })
        .catch(noop);
      return;
    }
    void navigator.clipboard
      .writeText(joinUrl)
      .then(() => setCopied(true))
      .catch(noop);
  }

  return (
    <div
      style={{
        marginTop: 6,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <button
        type="button"
        className={PRESSABLE_CLASS}
        onClick={share}
        aria-label={t.picker.shareAriaLabel}
        style={{
          padding: 8,
          background: "var(--opg-paper)",
          border: "none",
          borderRadius: 12,
          cursor: "pointer",
          lineHeight: 0,
        }}
      >
        <QrCode value={joinUrl} size={132} />
      </button>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "var(--opg-ink-secondary)",
        }}
      >
        {copied ? t.picker.linkCopied : t.picker.scanOrTap}
      </div>
    </div>
  );
}

function noop() {
  // A cancelled share sheet and a blocked clipboard are both fine: the code is on screen.
}

function gameLimits(game: GameSummary | null) {
  return { min: game?.minPlayers ?? 3, max: game?.maxPlayers ?? 8 };
}

/** "1 player", "2 players". */
export function formatPlayerCount(t: Dictionary, count: number): string {
  return format(pickPluralByCount(count, t.picker.playerCount), { count });
}

function VipHeader({
  t,
  code,
  playerCount,
}: {
  t: Dictionary;
  code: string;
  playerCount: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Highlight style={{ alignSelf: "flex-start", padding: "0 10px" }}>
        <Marker size={34} style={{ lineHeight: 1.15 }}>
          {t.picker.youreVip}
        </Marker>
      </Highlight>
      <div
        style={{
          fontSize: 17,
          fontWeight: 700,
          color: "var(--opg-ink-secondary)",
        }}
      >
        {format(t.picker.roomLine, {
          code,
          players: formatPlayerCount(t, playerCount),
        })}
      </div>
    </div>
  );
}

export function PhoneVipControls({
  view,
  error = null,
  onPickGame,
  onSetPack,
  onSetLocked,
  onSetSharedScreen,
  onKick,
  onStartGame,
}: PhoneVipControlsProps) {
  const { t } = useLocale();
  const selectedGame =
    view.games.find((g) => g.id === view.selectedGameId) ?? null;
  const activePlayers = view.players.filter((p) => !p.waitingForNextGame);
  const enabledPacks = view.packs.filter((p) => p.enabled);
  const limits = gameLimits(selectedGame);
  const disabledReason = startDisabledReason({
    t,
    selectedGame,
    sharedScreen: view.sharedScreen,
    playerCount: activePlayers.length,
    packCount: enabledPacks.length,
  });
  const blockedGameNames = view.games
    .filter((g) => isBlocked(g, view.sharedScreen))
    .map((g) => g.name);

  return (
    <PhoneScreen>
      <VipHeader t={t} code={view.code} playerCount={view.players.length} />

      {view.sharedScreen ? null : <RoomCodeHero t={t} code={view.code} />}

      <GamePicker
        t={t}
        games={view.games}
        selectedGameId={view.selectedGameId}
        sharedScreen={view.sharedScreen}
        onPickGame={onPickGame}
      />
      <SharedScreenToggle
        t={t}
        sharedScreen={view.sharedScreen}
        blockedNames={blockedGameNames}
        onSetSharedScreen={onSetSharedScreen}
      />
      <PackList t={t} packs={view.packs} onSetPack={onSetPack} />
      <LockCard t={t} locked={view.locked} onSetLocked={onSetLocked} />
      <PlayersCard
        t={t}
        players={view.players}
        you={view.you}
        onKick={onKick}
      />
      <StartButton
        t={t}
        selectedGame={selectedGame}
        disabledReason={disabledReason}
        minPlayers={limits.min}
        maxPlayers={limits.max}
        activeCount={activePlayers.length}
        error={error}
        onStartGame={onStartGame}
      />
    </PhoneScreen>
  );
}
