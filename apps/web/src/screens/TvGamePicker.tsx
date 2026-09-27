// design/TVGamePicker.dc.html — lobby pick screen (brand header + Room chip).
import type { CSSProperties } from "react";
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

/**
 * The card grid earns one row for up to four games — the roster today — and only wraps to a
 * second once a fifth game ships. `wide` is the roomy two-up look for a fresh room with one or
 * two games offered; `compact` fits three or four games across a single row; `dense` caps the
 * row at four and clips each card's blurb to two lines so a wrapped second row still lands
 * inside the stage rather than growing without bound as the roster keeps growing.
 */
type CardDensity = "wide" | "compact" | "dense";

function cardDensity(gameCount: number): CardDensity {
  if (gameCount <= 2) return "wide";
  if (gameCount <= 4) return "compact";
  return "dense";
}

/** One row for up to four games; beyond that, wrap at four columns rather than keep widening. */
function gridColumns(gameCount: number): number {
  if (gameCount <= 2) return 2;
  return Math.min(gameCount, 4);
}

interface CardMetrics {
  padding: string;
  gap: number;
  icon: number;
  name: number;
  blurb: number;
  blurbLines: number | undefined;
  meta: number;
  stamp: number;
}

/** Roomier metrics for two games, denser ones once a third has to share the row. */
function cardMetrics(density: CardDensity): CardMetrics {
  if (density === "dense") {
    return {
      padding: "18px 20px 20px",
      gap: 6,
      icon: 56,
      name: 38,
      blurb: 28,
      blurbLines: 2,
      meta: 28,
      stamp: 28,
    };
  }
  if (density === "compact") {
    return {
      padding: "22px 24px 24px",
      gap: 8,
      icon: 72,
      // 40, not 46. Four games share one row, which leaves each card about 190px of inner
      // width, and the names are wrapped in `overflow-wrap: break-word` so nothing can escape
      // the card. That containment turns a name too wide to fit into a word broken across two
      // lines rather than an overflow — "Imposter" rendered as "Imposte" / "r" on the screen
      // the whole room is looking at, and no layout invariant objects, because technically
      // nothing left its box.
      //
      // Wrapping *between* words is fine and unavoidable: measured in Permanent Marker, "Most
      // Likely To" is 210px on one line even at the 28px TV floor, so it was always going to
      // take two. What has to hold is that the longest single *word* fits: "Imposter" measures
      // 205px at 46 and 178px at 40, against that 190px box. If a future game ships a longer
      // single word, or this grid gains a fifth column, re-measure — do not assume.
      name: 40,
      blurb: 28,
      blurbLines: undefined,
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
    blurbLines: undefined,
    meta: 30,
    stamp: 38,
  };
}

/**
 * Roomy densities let the blurb wrap freely; `dense` (five-plus games, two rows of cards)
 * clips it to a fixed number of lines instead, so a long blurb cannot grow the card past the
 * row height the layout budgeted for it.
 */
function blurbStyle(metrics: CardMetrics): CSSProperties {
  const base: CSSProperties = { fontSize: metrics.blurb, lineHeight: 1.3 };
  if (metrics.blurbLines === undefined) return base;
  return {
    ...base,
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: metrics.blurbLines,
    overflow: "hidden",
  };
}

function GameCard({
  t,
  game,
  selected,
  justPicked,
  density,
}: {
  t: Dictionary;
  game: GameSummary;
  selected: boolean;
  justPicked: boolean;
  density: CardDensity;
}) {
  const reduced = useReducedMotion();
  const cue = useCue();
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!justPicked) return;
    playFx(cardRef.current, "pop", reduced);
    cue("tape");
  }, [justPicked, reduced, cue]);
  const metrics = cardMetrics(density);
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
        <div style={blurbStyle(metrics)}>{game.blurb}</div>
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
      {/*
        This is a read-only mirror of the VIP's phone, not a control the host can flip from
        the TV. Passing `disabled` keeps the primitive's dim look and `cursor: not-allowed`
        instead of a live-looking switch that silently does nothing when someone clicks it —
        the previous state, with no `onChange`, still let it be focused and pressed.
      */}
      <Switch
        checked={pack.enabled}
        size={42}
        labelFontSize={28}
        label={format(t.picker.packAccessibleName, { pack: pack.name })}
        disabled
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
  const density = cardDensity(view.games.length);
  const columns = gridColumns(view.games.length);

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
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: density === "wide" ? 40 : 28,
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
              density={density}
            />
          ))}
        </div>

        <PacksPanel t={t} packs={view.packs} selectedGame={selectedGame} />
      </div>

      <PickerFooter t={t} vipName={footerName(t, vip)} activePlayers={active} />
    </TvPage>
  );
}
