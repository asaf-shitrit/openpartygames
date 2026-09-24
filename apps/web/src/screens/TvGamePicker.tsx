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
import type { CardProps } from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { gameIconFor } from "../games";
import { TvPage } from "./shared";
import { formatPlayerCount } from "./PhoneVipControls";

function ratingLabel(t: Dictionary, rating: Rating): string {
  if (rating === "adult") return t.picker.ratingAdult;
  if (rating === "teen") return t.picker.ratingTeen;
  return t.picker.ratingFamily;
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

interface CardMetrics {
  padding: string;
  gap: number;
  icon: number;
  name: number;
  blurb: number;
  meta: number;
  stamp: number;
}

/** Roomier metrics for two games, denser ones once a third game has to fit. */
function cardMetrics(compact: boolean): CardMetrics {
  if (compact) {
    return {
      padding: "22px 24px 24px",
      gap: 8,
      icon: 72,
      name: 46,
      blurb: 28,
      meta: 28,
      stamp: 30,
    };
  }
  return {
    padding: "32px 32px 34px",
    gap: 14,
    icon: 120,
    name: 64,
    blurb: 34,
    meta: 30,
    stamp: 38,
  };
}

function GameCard({
  t,
  game,
  selected,
  justPicked,
  compact,
}: {
  t: Dictionary;
  game: GameSummary;
  selected: boolean;
  justPicked: boolean;
  compact: boolean;
}) {
  const reduced = useReducedMotion();
  const cue = useCue();
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!justPicked) return;
    playFx(cardRef.current, "pop", reduced);
    cue("tape");
  }, [justPicked, reduced, cue]);
  const metrics = cardMetrics(compact);
  return (
    <div ref={cardRef}>
      <Card
        {...cardLook(selected)}
        style={{
          padding: metrics.padding,
          display: "flex",
          flexDirection: "column",
          gap: metrics.gap,
        }}
      >
        {selected ? (
          <Stamp
            size={metrics.stamp}
            tilt={6}
            style={{ position: "absolute", insetInlineEnd: 22, top: 22 }}
          >
            <Icon name="check" size={metrics.stamp - 4} />
            <span>{t.picker.picked}</span>
          </Stamp>
        ) : null}
        <Icon
          name={gameIconFor(game.id)}
          size={metrics.icon}
          color="var(--opg-ink)"
        />
        <Marker size={metrics.name}>{game.name}</Marker>
        <div style={{ fontSize: metrics.blurb, lineHeight: 1.3 }}>
          {game.blurb}
        </div>
        <div
          style={{
            fontSize: metrics.meta,
            fontWeight: 700,
            color: "var(--opg-ink-secondary)",
          }}
        >
          {format(t.picker.playersAboutMinutes, {
            min: game.minPlayers,
            max: game.maxPlayers,
            minutes: game.minutes,
          })}
        </div>
      </Card>
    </div>
  );
}

function PackRow({
  t,
  pack,
  last,
}: {
  t: Dictionary;
  pack: PackSummary;
  last: boolean;
}) {
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
      <Chip height={42} fontSize={28}>
        {ratingLabel(t, pack.rating)}
      </Chip>
      <Switch
        checked={pack.enabled}
        size={42}
        labelFontSize={28}
        label={`${pack.name} pack`}
      />
    </div>
  );
}

interface VipLook {
  avatar: AvatarId | null;
  name: string;
}

function vipLook(t: Dictionary, vip: PlayerSummary | null): VipLook {
  if (!vip) return { avatar: null, name: t.common.someone };
  return { avatar: vip.avatar, name: vip.name };
}

function PickHeader({ t, vip }: { t: Dictionary; vip: PlayerSummary | null }) {
  const { avatar, name } = vipLook(t, vip);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
      <Avatar id={avatar} size={92} />
      <Highlight style={{ padding: "0 12px" }}>
        <Marker size={72}>{name}</Marker>
      </Highlight>
      <Marker size={72}>{t.picker.pickingGame}</Marker>
    </div>
  );
}

function PacksPanel({
  t,
  packs,
  selectedGame,
}: {
  t: Dictionary;
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
        {selectedGame
          ? format(t.picker.gamePacks, { game: selectedGame.name })
          : t.picker.packs}
      </Marker>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {packs.map((pack, index) => (
          <PackRow
            key={pack.id}
            t={t}
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
            {t.picker.noPacksYet}
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
        <div>{t.picker.adultPacksNote}</div>
      </div>
    </Card>
  );
}

function PickerFooter({
  t,
  vipName,
  activePlayers,
}: {
  t: Dictionary;
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
        {format(t.picker.startsFromPhone, {
          vip: vipName,
          players: formatPlayerCount(t, activePlayers),
        })}
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

function footerName(t: Dictionary, vip: PlayerSummary | null): string {
  return vip?.name ?? t.picker.theVip;
}

export function TvGamePicker({ view }: { view: HostRoomView }) {
  const { t } = useLocale();
  const vip = pickPlayer(view.players, view.vipId);
  const selectedGame = pickGame(view.games, view.selectedGameId);
  const active = countActivePlayers(view.players);
  const justPicked = useJustPicked(view.selectedGameId);
  const compactCards = view.games.length > 2;

  return (
    <TvPage>
      <TvHeader variant="brand" roomCode={view.code} />

      <PickHeader t={t} vip={vip} />

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
            gridTemplateColumns: `repeat(${compactCards ? 3 : 2}, minmax(0, 1fr))`,
            gap: compactCards ? 28 : 40,
            paddingTop: 8,
            alignContent: "start",
          }}
        >
          {view.games.map((game) => (
            <GameCard
              key={game.id}
              t={t}
              game={game}
              selected={game.id === view.selectedGameId}
              justPicked={game.id === justPicked}
              compact={compactCards}
            />
          ))}
        </div>

        <PacksPanel t={t} packs={view.packs} selectedGame={selectedGame} />
      </div>

      <PickerFooter t={t} vipName={footerName(t, vip)} activePlayers={active} />
    </TvPage>
  );
}
