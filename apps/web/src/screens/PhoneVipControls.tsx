// design/PhoneVIPControls.dc.html — VIP lobby controls.
import type {
  GameSummary,
  PackSummary,
  PlayerSummary,
  PlayerRoomView,
  Rating,
} from "@opg/protocol";
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
import { gameIconFor } from "../games";

export interface PhoneVipControlsProps {
  view: PlayerRoomView;
  error?: string | null;
  onPickGame: (gameId: string) => void;
  onSetPack: (packId: string, enabled: boolean) => void;
  onSetLocked: (locked: boolean) => void;
  onKick: (playerId: string) => void;
  onStartGame: () => void;
}

function ratingLabel(rating: Rating): string {
  if (rating === "adult") return "Adult";
  if (rating === "teen") return "Teen";
  return "Family";
}

function startDisabledReason(
  selectedGame: GameSummary | null,
  playerCount: number,
  packCount: number,
): string | undefined {
  if (!selectedGame) return "Pick a game first";
  if (playerCount < selectedGame.minPlayers) {
    return `Need at least ${selectedGame.minPlayers} players`;
  }
  if (packCount === 0) return "Turn on at least one pack";
  return undefined;
}

function PlayerRow({
  player,
  isYou,
  onKick,
}: {
  player: PlayerSummary;
  isYou: boolean;
  onKick: (id: string) => void;
}) {
  return (
    <div style={{ height: 50, display: "flex", alignItems: "center", gap: 10 }}>
      <Avatar id={player.avatar} size={36} />
      <div style={{ flexGrow: 1, fontSize: 19, fontWeight: 700 }}>
        {player.name}
        {player.isVip ? " (VIP)" : ""}
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
          You
        </div>
      ) : (
        <Button
          size="md"
          variant="secondary"
          onClick={() => onKick(player.id)}
          aria-label={`Kick ${player.name}`}
        >
          <span>Kick</span>
        </Button>
      )}
    </div>
  );
}

function GameButton({
  game,
  selected,
  onPick,
}: {
  game: GameSummary;
  selected: boolean;
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
        display: "flex",
        flexDirection: "column",
        gap: 4,
        textAlign: "left",
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
            <div>Picked</div>
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
        about {game.minutes} min
      </div>
    </button>
  );
}

function GamePicker({
  games,
  selectedGameId,
  onPickGame,
}: {
  games: GameSummary[];
  selectedGameId: string;
  onPickGame: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Marker size={24} style={{ lineHeight: 1.15 }}>
        Pick a game
      </Marker>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        {games.map((game) => (
          <GameButton
            key={game.id}
            game={game}
            selected={game.id === selectedGameId}
            onPick={onPickGame}
          />
        ))}
      </div>
    </div>
  );
}

function PackRow({
  pack,
  last,
  onSetPack,
}: {
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
        {ratingLabel(pack.rating)}
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
  packs,
  onSetPack,
}: {
  packs: PackSummary[];
  onSetPack: (id: string, enabled: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Marker size={24} style={{ lineHeight: 1.15 }}>
        Packs
      </Marker>
      <Card
        variant="M"
        style={{ padding: "0 14px", display: "flex", flexDirection: "column" }}
      >
        {packs.map((pack, index) => (
          <PackRow
            key={pack.id}
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
            No packs for this game yet.
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
        Adult packs stay off unless the VIP turns them on.
      </div>
    </div>
  );
}

function LockCard({
  locked,
  onSetLocked,
}: {
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
          Lock room
        </div>
        <div
          style={{
            fontSize: 16,
            lineHeight: 1.25,
            color: "var(--opg-ink-secondary)",
          }}
        >
          Stops new people joining
        </div>
      </div>
      <Switch
        checked={locked}
        size={30}
        label="Lock room"
        onChange={(value) => onSetLocked(value)}
      />
    </Card>
  );
}

function PlayersCard({
  players,
  you,
  onKick,
}: {
  players: PlayerSummary[];
  you: string;
  onKick: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Marker size={24} style={{ lineHeight: 1.15 }}>
        Players ({players.length})
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

function StartButton({
  selectedGame,
  disabledReason,
  minPlayers,
  maxPlayers,
  activeCount,
  error,
  onStartGame,
}: {
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
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {error ? (
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
      ) : null}
      <Button
        size="xl"
        fullWidth
        disabled={Boolean(disabledReason)}
        disabledReason={disabledReason}
        onClick={onStartGame}
      >
        <Icon name="arrow-right" size={24} color="var(--opg-paper)" />
        <span>
          {selectedGame ? `Start ${selectedGame.name}` : "Start game"}
        </span>
      </Button>
      <div
        style={{
          textAlign: "center",
          fontSize: 16,
          fontWeight: 700,
          color: "var(--opg-ink-secondary)",
        }}
      >
        {minPlayers}–{maxPlayers} players · {activeCount} here
      </div>
    </div>
  );
}

function gameLimits(game: GameSummary | null) {
  return { min: game?.minPlayers ?? 3, max: game?.maxPlayers ?? 8 };
}

/** "1 player", "2 players". */
export function formatPlayerCount(count: number): string {
  return `${count} ${count === 1 ? "player" : "players"}`;
}

export function PhoneVipControls({
  view,
  error = null,
  onPickGame,
  onSetPack,
  onSetLocked,
  onKick,
  onStartGame,
}: PhoneVipControlsProps) {
  const selectedGame =
    view.games.find((g) => g.id === view.selectedGameId) ?? null;
  const activePlayers = view.players.filter((p) => !p.waitingForNextGame);
  const enabledPacks = view.packs.filter((p) => p.enabled);
  const limits = gameLimits(selectedGame);
  const disabledReason = startDisabledReason(
    selectedGame,
    activePlayers.length,
    enabledPacks.length,
  );

  return (
    <PhoneScreen>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Highlight style={{ alignSelf: "flex-start", padding: "0 10px" }}>
          <Marker size={34} style={{ lineHeight: 1.15 }}>
            You're the VIP
          </Marker>
        </Highlight>
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: "var(--opg-ink-secondary)",
          }}
        >
          Room {view.code} · {formatPlayerCount(view.players.length)}
        </div>
      </div>

      <GamePicker
        games={view.games}
        selectedGameId={view.selectedGameId}
        onPickGame={onPickGame}
      />
      <PackList packs={view.packs} onSetPack={onSetPack} />
      <LockCard locked={view.locked} onSetLocked={onSetLocked} />
      <PlayersCard players={view.players} you={view.you} onKick={onKick} />
      <StartButton
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
