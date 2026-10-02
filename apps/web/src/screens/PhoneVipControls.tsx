// design/PhoneVIPControls.dc.html — VIP lobby controls.
import type {
  GameSummary,
  PackSummary,
  PlayerSummary,
  PlayerRoomView,
  Rating,
} from "@opg/protocol";
import type { CSSProperties, RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";
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
import { readyPlayerCount } from "./player-signals";
import { useFocusOnStepChange } from "./confirm-focus";
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

/**
 * How much of the screen a pinned footer may take before pinning it stops being a kindness.
 * Measured against the rendered viewport, so enlarged text counts: at 200% a three-line error
 * above an XL button fills better than three quarters of a phone, and a player picking a game
 * underneath would be choosing it through a letterbox.
 */
const MAX_PINNED_SHARE = 1 / 3;

/**
 * Keeps the start-button footer honest about riding the bottom of the viewport.
 *
 * While it is pinned it reserves its own room at the bottom of the document's scroll box via
 * `scroll-padding-bottom` — the CSS property built for exactly this: without it, a player
 * scrolled toward the last row (the browser brings a focused or tapped control to the *nearest*
 * edge of the viewport, not past it) lands with that row flush against the bottom edge, which is
 * precisely where the footer paints. Tracked live, not a fixed guess, because the footer's
 * height moves with the error line, the disabled reason and locale word-wrap — and it is that
 * same measurement that decides whether it should be pinned at all. Scoped to this screen's
 * lifetime: cleared on unmount so it never leaks onto a screen with no footer of its own.
 */
function useStickyFooter() {
  const ref = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  useLayoutEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return undefined;
    const measure = () => {
      // Two different measurements on purpose: the share is in rendered pixels, the same space
      // the viewport is measured in, so text zoom shows up in it. scroll-padding is a CSS
      // length, so it takes the layout height, which zoom leaves alone.
      const fits = el.getBoundingClientRect().height <= window.innerHeight * MAX_PINNED_SHARE;
      setPinned(fits);
      root.style.scrollPaddingBottom = fits ? `${el.clientHeight}px` : "";
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      root.style.scrollPaddingBottom = "";
    };
  }, []);
  return { ref, pinned };
}

/**
 * Whether the server has caught up with the choice being shown, which is the one moment the
 * optimistic value has nothing left to add. Deliberately not "any newer value wins": a VIP
 * who taps twice while the first send is still in flight is answered by the echo of the tap
 * *before* their last one, and dropping the optimistic value there would flip the switch
 * back under their thumb. It stands until the room agrees with it.
 */
function caughtUp<T>(pending: T | null, committed: T): boolean {
  return pending !== null && pending === committed;
}

/**
 * Shows a locally chosen value immediately instead of waiting for the server to echo it
 * back. Every VIP toggle here (`onSetPack`, `onSetLocked`, `onSetSharedScreen`) is a
 * fire-and-forget socket send with nothing rendered from but the view the server last
 * confirmed, so on a slow link a tapped Switch held its old state through the whole round
 * trip — the natural response to an apparently unresponsive toggle is to tap it again,
 * which flips it straight back. The optimistic value clears itself the moment the
 * committed value (the next view) catches up to it, so a slow *or rejected* change
 * settles back onto whatever the server actually holds rather than getting stuck showing
 * a choice that never took.
 */
function useOptimistic<T>(committed: T): [T, (next: T) => void] {
  const [pending, setPending] = useState<T | null>(null);
  // Clearing a stale optimistic value against a newly-arrived prop, not synchronizing
  // with anything outside React, so this adjusts state during render rather than in an
  // effect — React's own documented pattern for "resetting state when a prop changes":
  // a state-held copy of the previous prop, compared and updated in the render body
  // itself (not a ref, which the render phase must not read or write). Conditional, so
  // it bails out the instant the two agree instead of looping.
  const [lastCommitted, setLastCommitted] = useState(committed);
  if (lastCommitted !== committed) {
    setLastCommitted(committed);
    if (caughtUp(pending, committed)) setPending(null);
  }
  return [pending ?? committed, setPending];
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
  /** Every pack the room could turn on for this game, enabled or not. */
  packTotal: number;
}

function startDisabledReason(check: DisabledCheck): string | undefined {
  const { t, selectedGame, sharedScreen, playerCount, packCount, packTotal } = check;
  if (!selectedGame) return t.picker.pickGameFirst;
  if (isBlocked(selectedGame, sharedScreen)) {
    return format(t.picker.gameNeedsSharedScreen, { game: selectedGame.name });
  }
  if (playerCount < selectedGame.minPlayers) {
    return format(t.picker.needAtLeastPlayers, {
      count: selectedGame.minPlayers,
    });
  }
  // Nothing to turn on (a Hebrew room has no Real or Nah pack) is not "turn one on".
  if (packTotal === 0) return t.picker.noPacksYet;
  if (packCount === 0) return t.picker.turnOnPack;
  return undefined;
}

/**
 * Removing someone is the one destructive action a room-full of rows makes easiest to
 * fire by accident: every row repeats the same tap target, right next to a scrolling
 * list a thumb keeps sliding past. So kick is two taps, not one — the danger-variant
 * button opens a confirm inline rather than kicking on the spot, the same shape
 * `VipGameBar`'s end-game confirm already uses for its one irreversible action.
 */
function KickButton({
  t,
  player,
  onKick,
}: {
  t: Dictionary;
  player: PlayerSummary;
  onKick: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const setStep = useFocusOnStepChange(confirming);
  // `display: contents` so the wrapper holds a ref without adding a box: the confirm panel
  // still claims its own row in the flex list and the idle button still sits inline.
  return (
    <span ref={setStep} style={{ display: "contents" }}>
      {confirming ? (
        <div
          style={{
            flexBasis: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {format(t.picker.kickConfirm, { name: player.name })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {/* Cancel first, matching VipGameBar's end-game confirm: the safe choice leads,
                and it is the one focus lands on when this step opens. */}
            <Button
              size="md"
              variant="secondary"
              onClick={() => setConfirming(false)}
            >
              <span>{t.picker.cancel}</span>
            </Button>
            <Button size="md" variant="danger" onClick={() => onKick(player.id)}>
              <Icon name="kick" size={18} color="var(--opg-paper)" />
              <span>{t.picker.kickConfirmYes}</span>
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="md"
          variant="danger"
          onClick={() => setConfirming(true)}
          aria-label={format(t.picker.kickAriaLabel, { name: player.name })}
        >
          <Icon name="kick" size={18} color="var(--opg-paper)" />
          <span>{t.picker.kick}</span>
        </Button>
      )}
    </span>
  );
}

/**
 * The same dashed tag the lobby and the waiting room use, on the one roster that has to act
 * on it: this is the VIP's list, and away is the difference between the five names they can
 * see and the four players Start will actually count. The word carries it — the faded doodle
 * beside it only seconds the word.
 */
function AwayTag({ t }: { t: Dictionary }) {
  return (
    <span
      style={{
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 1.15,
        padding: "0 6px",
        flexShrink: 0,
        color: "var(--opg-ink-secondary)",
        border: "2px dashed var(--opg-muted)",
        borderRadius: "var(--opg-radius-button)",
      }}
    >
      {t.status.away}
    </span>
  );
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
    <div
      style={{
        minHeight: 50,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Avatar id={player.avatar} size={36} faded={!player.connected} />
      <div
        style={{
          flexGrow: 1,
          minWidth: 0,
          fontSize: 19,
          fontWeight: 700,
          overflowWrap: "break-word",
        }}
      >
        {player.name}
        {player.isVip ? t.picker.vipSuffix : ""}
      </div>
      {player.connected ? null : <AwayTag t={t} />}
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
        <KickButton t={t} player={player} onKick={onKick} />
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
        flexWrap: "wrap",
        alignItems: "center",
        gap: 4,
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 1.25,
      }}
    >
      <Icon name="monitor" size={18} />
      <div style={{ minWidth: 0, overflowWrap: "break-word" }}>
        {t.picker.sharedScreenOnly}
      </div>
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
          // Wrapping, not squeezing: at 200% text the tick and the word "Picked" together are
          // wider than half a phone, and a row that cannot wrap pushes them off the side.
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Icon name={gameIconFor(game.id)} size={40} />
        {selected ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 2,
              fontSize: 16,
              fontWeight: 700,
              // The checkmark carries the marker red; on this tile's highlight background
              // that red reads at 4.29:1 for text, under the 4.5:1 floor for body text, so
              // the label itself uses the ink colour instead.
              color: "var(--opg-ink)",
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
      <Marker level={2} size={24} style={{ lineHeight: 1.15 }}>
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
  const [enabled, setEnabled] = useOptimistic(pack.enabled);
  return (
    <div
      style={{
        minHeight: 46,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        borderBottom: last ? undefined : "2px dashed var(--opg-muted)",
      }}
    >
      <div
        style={{
          flexGrow: 1,
          minWidth: 0,
          fontSize: 17,
          fontWeight: 700,
          overflowWrap: "break-word",
          color: enabled ? "var(--opg-ink)" : "var(--opg-ink-secondary)",
        }}
      >
        {pack.name}
      </div>
      <Chip
        height={28}
        fontSize={16}
        style={{ padding: "0 8px", borderWidth: 2, flexShrink: 0 }}
      >
        {ratingLabel(t, pack.rating)}
      </Chip>
      <Switch
        onLabel={t.picker.switchOn}
        offLabel={t.picker.switchOff}
        checked={enabled}
        size={30}
        label={format(t.picker.packAccessibleName, { pack: pack.name })}
        onChange={(next) => {
          setEnabled(next);
          onSetPack(pack.id, next);
        }}
        style={{ flexShrink: 0 }}
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
      <Marker level={2} size={24} style={{ lineHeight: 1.15 }}>
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
  const [shown, setShown] = useOptimistic(sharedScreen);
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
      <Icon name="monitor" size={26} style={{ flexShrink: 0 }} />
      <div
        style={{
          flexGrow: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div
          style={{
            fontSize: 19,
            fontWeight: 700,
            lineHeight: 1.2,
            overflowWrap: "break-word",
          }}
        >
          {t.picker.addSharedScreen}
        </div>
        <div
          style={{
            fontSize: 16,
            lineHeight: 1.25,
            color: "var(--opg-ink-secondary)",
            overflowWrap: "break-word",
          }}
        >
          {sharedScreenHint(t, shown, blockedNames)}
        </div>
      </div>
      <Switch
        onLabel={t.picker.switchOn}
        offLabel={t.picker.switchOff}
        checked={shown}
        size={30}
        label={t.picker.addSharedScreen}
        onChange={(next) => {
          setShown(next);
          onSetSharedScreen(next);
        }}
        style={{ flexShrink: 0 }}
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
  const [checked, setChecked] = useOptimistic(locked);
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
      <Icon name="lock" size={26} style={{ flexShrink: 0 }} />
      <div
        style={{
          flexGrow: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div
          style={{
            fontSize: 19,
            fontWeight: 700,
            lineHeight: 1.2,
            overflowWrap: "break-word",
          }}
        >
          {t.picker.lockRoom}
        </div>
        <div
          style={{
            fontSize: 16,
            lineHeight: 1.25,
            color: "var(--opg-ink-secondary)",
            overflowWrap: "break-word",
          }}
        >
          {t.picker.lockRoomHint}
        </div>
      </div>
      <Switch
        onLabel={t.picker.switchOn}
        offLabel={t.picker.switchOff}
        checked={checked}
        size={30}
        label={t.picker.lockRoom}
        onChange={(next) => {
          setChecked(next);
          onSetLocked(next);
        }}
        style={{ flexShrink: 0 }}
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
      <Marker level={2} size={24} style={{ lineHeight: 1.15 }}>
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
    // Announced: this is why the start the VIP just asked for did not happen, and the button
    // it explains sits below it, so a screen reader would otherwise pass straight over it.
    <div
      role="alert"
      style={{
        fontSize: 16,
        fontWeight: 700,
        // 16px bold is body text, under WCAG's 18.66px bold "large text" floor, so this
        // uses the darkened --opg-marker-text (5.04:1 on paper) rather than the brand
        // --opg-marker (4.43:1, under the 4.5:1 body-text floor) — see styles.css.
        color: "var(--opg-marker-text)",
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
  starting,
}: {
  t: Dictionary;
  selectedGame: GameSummary | null;
  starting: boolean;
}) {
  if (starting) return <span>{t.picker.startingGame}</span>;
  return (
    <span>
      {selectedGame
        ? format(t.picker.startNamedGame, { game: selectedGame.name })
        : t.picker.startGame}
    </span>
  );
}

/**
 * `onStartGame` is a fire-and-forget socket send: nothing in `view` moves until the
 * server's next state frame arrives, so without this the button stayed enabled and
 * tappable through the whole round trip and a VIP on a slow link could send two
 * `start-game` messages. `starting` latches true on the first tap and only clears when a
 * new `error` arrives — the one signal this screen gets that the attempt was rejected
 * rather than merely slow. A successful start unmounts this screen instead, so there is
 * no false-negative case where the latch would need to clear on its own.
 */
function useStartPending(error: string | null): [boolean, () => void] {
  const [starting, setStarting] = useState(false);
  // Adjusted during render against a newly-arrived `error` prop, the same reasoning as
  // `useOptimistic` above — not an effect, because nothing outside React needs to
  // observe this transition.
  const [lastError, setLastError] = useState(error);
  if (lastError !== error) {
    setLastError(error);
    if (error && starting) setStarting(false);
  }
  return [starting, () => setStarting(true)];
}

/** The footer riding the bottom of the viewport, or sitting at the end of the scroll once
 * it grows too tall to pin — see the comment on `useStickyFooter` above. */
function startButtonFooterStyle(pinned: boolean): CSSProperties {
  return {
    marginTop: "auto",
    position: pinned ? "sticky" : "static",
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
  };
}

function PlayerRangeLine({
  t,
  min,
  max,
  count,
}: {
  t: Dictionary;
  min: number;
  max: number;
  count: number;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        fontSize: 16,
        fontWeight: 700,
        color: "var(--opg-ink-secondary)",
      }}
    >
      {format(t.picker.playerRangeHere, { min, max, count })}
    </div>
  );
}

interface StartButtonState {
  disabled: boolean;
  disabledReason: string | undefined;
}

/** While a start is in flight the button is disabled with no reason line of its own —
 * the "Starting…" label already says why nothing happens on tap. */
function startButtonState(
  starting: boolean,
  disabledReason: string | undefined,
): StartButtonState {
  if (starting) return { disabled: true, disabledReason: undefined };
  return { disabled: Boolean(disabledReason), disabledReason };
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
  footerRef,
  pinned,
}: {
  t: Dictionary;
  selectedGame: GameSummary | null;
  disabledReason: string | undefined;
  minPlayers: number;
  maxPlayers: number;
  activeCount: number;
  error: string | null;
  onStartGame: () => void;
  footerRef: RefObject<HTMLDivElement | null>;
  pinned: boolean;
}) {
  const [starting, markStarting] = useStartPending(error);
  const handleStart = () => {
    markStarting();
    onStartGame();
  };
  const { disabled, disabledReason: shownReason } = startButtonState(
    starting,
    disabledReason,
  );
  return (
    // The picker, the packs and the player list together run well past a phone screen,
    // so the primary action rides the bottom of the viewport instead of sitting at the
    // end of the scroll where it cannot be reached — until it grows large enough that
    // riding there would hide the list it belongs to, and then it takes its place at the
    // end of the scroll after all.
    <div ref={footerRef} style={startButtonFooterStyle(pinned)}>
      <StartButtonError error={error} />
      <Button
        size="xl"
        fullWidth
        disabled={disabled}
        disabledReason={shownReason}
        onClick={handleStart}
      >
        <Icon
          name="arrow-right"
          size={24}
          color="var(--opg-paper)"
        />
        <StartButtonLabel t={t} selectedGame={selectedGame} starting={starting} />
      </Button>
      <PlayerRangeLine t={t} min={minPlayers} max={maxPlayers} count={activeCount} />
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
          // Four 48px letters and their separators are wider than a phone at 200% text, and a
          // room code that runs off the side is a code nobody can read out. It takes a second
          // line instead; at every normal size it stays on one.
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          maxWidth: "100%",
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
        <Marker level={1} size={34} style={{ lineHeight: 1.15 }}>
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
  const { ref: footerRef, pinned: footerPinned } = useStickyFooter();
  const selectedGame =
    view.games.find((g) => g.id === view.selectedGameId) ?? null;
  // The same count the server will apply when this button's message lands: a phone that has
  // dropped off cannot play, however present its name looks in the roster below. Counting the
  // roster instead left the VIP with an enabled Start that the room would only refuse.
  const readyCount = readyPlayerCount(view);
  const enabledPacks = view.packs.filter((p) => p.enabled);
  const limits = gameLimits(selectedGame);
  const disabledReason = startDisabledReason({
    t,
    selectedGame,
    sharedScreen: view.sharedScreen,
    playerCount: readyCount,
    packCount: enabledPacks.length,
    packTotal: view.packs.length,
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
        activeCount={readyCount}
        error={error}
        onStartGame={onStartGame}
        footerRef={footerRef}
        pinned={footerPinned}
      />
    </PhoneScreen>
  );
}
