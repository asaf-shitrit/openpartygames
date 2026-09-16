// design/TVGamePicker.dc.html — lobby pick screen (brand header + Room chip).
import { useEffect, useRef, useState } from "react";
import type {
  AvatarId,
  GameSummary,
  HostRoomView,
  PackSummary,
  PlayerSummary,
  Rating,
} from "@opg/protocol";
import {
  Avatar,
  Card,
  Chip,
  Highlight,
  Icon,
  Marker,
  Stamp,
  Switch,
  TvHeader,
  playFx,
  useCue,
  useReducedMotion,
} from "@opg/ui";
import type { CardProps, IconName } from "@opg/ui";
import { TvPage } from "./shared";

function gameIcon(id: string): IconName {
  if (id === "imposter") return "mask";
  return "cards";
}

function ratingLabel(rating: Rating): string {
  if (rating === "adult") return "Adult";
  if (rating === "teen") return "Teen";
  return "Family";
}

interface PickedState {
  previous: string;
  justPicked: string | null;
}

/** The game id that just became selected, or null on mount and on every unchanged render. */
function useJustPicked(selectedGameId: string): string | null {
  const [state, setState] = useState<PickedState>(() => ({
    previous: selectedGameId,
    justPicked: null,
  }));
  if (state.previous !== selectedGameId) {
    setState({ previous: selectedGameId, justPicked: selectedGameId });
    return selectedGameId;
  }
  return state.justPicked;
}

type CardLook = Pick<CardProps, "variant" | "tilt" | "background">;

/** The highlighted look for the picked game, the quiet one for the rest. */
function cardLook(selected: boolean): CardLook {
  if (selected) {
    return { variant: "L", tilt: -1, background: "var(--opg-highlight-soft)" };
  }
  return { variant: "Malt", tilt: 1 };
}

function GameCard({
  game,
  selected,
  justPicked,
}: {
  game: GameSummary;
  selected: boolean;
  justPicked: boolean;
}) {
  const reduced = useReducedMotion();
  const cue = useCue();
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!justPicked) return;
    playFx(cardRef.current, "pop", reduced);
    cue("tape");
  }, [justPicked, reduced, cue]);
  return (
    <div ref={cardRef}>
      <Card
        {...cardLook(selected)}
        style={{
          padding: "32px 32px 34px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {selected ? (
          <Stamp
            size={38}
            tilt={6}
            style={{ position: "absolute", right: 22, top: 26 }}
          >
            <Icon name="check" size={34} />
            <span>Picked</span>
          </Stamp>
        ) : null}
        <Icon name={gameIcon(game.id)} size={120} color="var(--opg-ink)" />
        <Marker size={64}>{game.name}</Marker>
        <div style={{ fontSize: 34, lineHeight: 1.3 }}>{game.blurb}</div>
        <div
          style={{
            fontSize: 30,
            fontWeight: 700,
            color: "var(--opg-ink-secondary)",
          }}
        >
          {game.minPlayers}–{game.maxPlayers} players · about {game.minutes}{" "}
          min
        </div>
      </Card>
    </div>
  );
}

function PackRow({ pack, last }: { pack: PackSummary; last: boolean }) {
  return (
    <div
      style={{
        height: 70,
        display: "flex",
        alignItems: "center",
        gap: 16,
        borderBottom: last ? undefined : "2px dashed var(--opg-muted)",
      }}
    >
      <div
        style={{
          flexGrow: 1,
          fontSize: 32,
          fontWeight: 700,
          color: pack.enabled ? "var(--opg-ink)" : "var(--opg-ink-secondary)",
        }}
      >
        {pack.name}
      </div>
      <Chip height={42} fontSize={26}>
        {ratingLabel(pack.rating)}
      </Chip>
      <Switch checked={pack.enabled} size={42} label={`${pack.name} pack`} />
    </div>
  );
}

interface VipLook {
  avatar: AvatarId | null;
  name: string;
}

function vipLook(vip: PlayerSummary | null): VipLook {
  if (!vip) return { avatar: null, name: "Someone" };
  return { avatar: vip.avatar, name: vip.name };
}

function PickHeader({ vip }: { vip: PlayerSummary | null }) {
  const { avatar, name } = vipLook(vip);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
      <Avatar id={avatar} size={92} />
      <Highlight style={{ padding: "0 12px" }}>
        <Marker size={72}>{name}</Marker>
      </Highlight>
      <Marker size={72}>is picking a game</Marker>
    </div>
  );
}

function PacksPanel({
  packs,
  selectedGame,
}: {
  packs: PackSummary[];
  selectedGame: GameSummary | null;
}) {
  return (
    <Card
      variant="M"
      style={{
        padding: "30px 34px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <Marker size={50}>
        {selectedGame ? `${selectedGame.name} packs` : "Packs"}
      </Marker>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {packs.map((pack, index) => (
          <PackRow
            key={pack.id}
            pack={pack}
            last={index === packs.length - 1}
          />
        ))}
        {packs.length === 0 ? (
          <div
            style={{
              fontSize: 28,
              color: "var(--opg-ink-secondary)",
              padding: "18px 0",
            }}
          >
            No packs for this game yet.
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          fontSize: 28,
          lineHeight: 1.3,
          color: "var(--opg-ink-secondary)",
        }}
      >
        <Icon
          name="lock"
          size={30}
          color="var(--opg-ink-secondary)"
          style={{ marginTop: 3 }}
        />
        <div>Adult packs stay off unless the VIP turns them on.</div>
      </div>
    </Card>
  );
}

function PickerFooter({
  vipName,
  activePlayers,
}: {
  vipName: string;
  activePlayers: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontSize: 34,
        fontWeight: 700,
      }}
    >
      <Icon name="monitor" size={36} />
      <div>
        {vipName} starts the game from their phone · {activePlayers}{" "}
        {activePlayers === 1 ? "player" : "players"}
      </div>
    </div>
  );
}

function pickPlayer(
  players: PlayerSummary[],
  id: string | null,
): PlayerSummary | null {
  return players.find((player) => player.id === id) ?? null;
}

function pickGame(games: GameSummary[], id: string): GameSummary | null {
  return games.find((game) => game.id === id) ?? null;
}

function countActivePlayers(players: PlayerSummary[]): number {
  return players.filter((player) => !player.waitingForNextGame).length;
}

function footerName(vip: PlayerSummary | null): string {
  return vip?.name ?? "The VIP";
}

export function TvGamePicker({ view }: { view: HostRoomView }) {
  const vip = pickPlayer(view.players, view.vipId);
  const selectedGame = pickGame(view.games, view.selectedGameId);
  const active = countActivePlayers(view.players);
  const justPicked = useJustPicked(view.selectedGameId);

  return (
    <TvPage>
      <TvHeader variant="brand" roomCode={view.code} />

      <PickHeader vip={vip} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 660px",
          gap: 56,
          flexGrow: 1,
          alignItems: "start",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 40,
            paddingTop: 8,
          }}
        >
          {view.games.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              selected={game.id === view.selectedGameId}
              justPicked={game.id === justPicked}
            />
          ))}
        </div>

        <PacksPanel packs={view.packs} selectedGame={selectedGame} />
      </div>

      <PickerFooter vipName={footerName(vip)} activePlayers={active} />
    </TvPage>
  );
}
