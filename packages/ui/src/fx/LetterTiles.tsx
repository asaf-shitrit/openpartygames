// The guess row for the Imposter "last chance": a row of hand-drawn paper tiles,
// blank while guessing and flipping face up as letters are revealed.
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../reduced-motion";
import { playFx } from "./animate";

const MAX_TILES = 40;
const DEFAULT_MAX_WIDTH = 1500;
const DEFAULT_SIZE = 72;
const TILE_GAP_RATIO = 0.16;

export interface LetterTilesProps {
  /** Number of tiles to show (typed length while guessing; guess length when revealing). */
  length: number;
  /** Letters to show, left to right. Tiles past `revealed` stay blank. */
  letters?: string;
  /** How many letters are face up. Default 0 (all blank). */
  revealed?: number;
  /** Tile size in px. Default 72 (TV). */
  size?: number;
  /** Available width for the row in px. Default 1500. */
  maxWidthPx?: number;
  /** Animate tiles added after mount (pop) and letters revealed after mount (flip in). False renders settled. */
  live: boolean;
  label?: string;
  style?: CSSProperties;
}

/** The tile size to use so `length` tiles (each with a gap) fit within `maxWidthPx`. */
export function tileSizeFor(
  length: number,
  maxWidthPx: number,
  preferredSize: number,
): number {
  const count = Math.max(1, Math.min(length, MAX_TILES));
  const widthAt = (size: number) => count * size * (1 + TILE_GAP_RATIO);
  if (widthAt(preferredSize) <= maxWidthPx) return preferredSize;
  const fitted = maxWidthPx / (count * (1 + TILE_GAP_RATIO));
  return Math.max(24, Math.floor(fitted));
}

interface TileEntry {
  id: string;
  index: number;
  letter: string;
  faceUp: boolean;
}

function tileEntries(
  length: number,
  letters: string,
  revealed: number,
): TileEntry[] {
  const glyphs = Array.from(letters);
  const count = Math.max(0, Math.min(length, MAX_TILES));
  return Array.from({ length: count }, (_, index) => ({
    id: `letter-tile-${index}`,
    index,
    letter: (glyphs[index] ?? "").toUpperCase(),
    faceUp: index < revealed,
  }));
}

function tilesLabel(
  label: string | undefined,
  length: number,
  letters: string,
  revealed: number,
): string {
  if (label !== undefined) return label;
  if (revealed >= length && length > 0) {
    return Array.from(letters).slice(0, length).join("").toUpperCase();
  }
  return `${length} letters`;
}

function tileStyle(size: number): CSSProperties {
  return {
    width: size,
    height: size,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--opg-card)",
    border: "4px solid var(--opg-ink)",
    borderRadius: "var(--opg-radius-m)",
  };
}

function LetterGlyph({ letter, size }: { letter: string; size: number }) {
  return (
    <span
      className="opg-marker"
      style={{ fontSize: Math.round(size * 0.62), lineHeight: 1 }}
    >
      {letter}
    </span>
  );
}

function useMountCounts(length: number, revealed: number, live: boolean) {
  const [mountCounts] = useState(() => ({
    length: live ? length : Number.POSITIVE_INFINITY,
    revealed: live ? revealed : Number.POSITIVE_INFINITY,
  }));
  return mountCounts;
}

function flipInLetter(el: HTMLElement, reduced: boolean): void {
  const spec: KeyframeAnimationOptions = {
    duration: 260,
    easing: "ease-out",
    fill: "both",
  };
  if (reduced) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], spec);
    return;
  }
  el.animate(
    [
      { rotate: "x 90deg", opacity: 0.4 },
      { rotate: "x 0deg", opacity: 1 },
    ],
    spec,
  );
}

/** Plays `play` on `elRef.current` exactly once, the first time `active` becomes true. */
function usePlayOnce(
  elRef: { current: HTMLElement | null },
  active: boolean,
  play: (el: HTMLElement) => void,
): void {
  const playRef = useRef(play);
  useEffect(() => {
    playRef.current = play;
  });
  useEffect(() => {
    if (!active) return;
    const el = elRef.current;
    if (el !== null) playRef.current(el);
    // Deliberately keyed on `active` alone: `elRef` and `playRef` are stable refs,
    // and the point is to fire once when `active` first turns true.
  }, [active, elRef]);
}

function Tile({
  entry,
  size,
  mountCounts,
}: {
  entry: TileEntry;
  size: number;
  mountCounts: { length: number; revealed: number };
}) {
  const reduced = useReducedMotion();
  const tileRef = useRef<HTMLDivElement>(null);
  const letterRef = useRef<HTMLSpanElement>(null);
  const isNewTile = entry.index >= mountCounts.length;
  const isNewReveal = entry.faceUp && entry.index >= mountCounts.revealed;
  usePlayOnce(tileRef, isNewTile, (el) => playFx(el, "pop", reduced));
  usePlayOnce(letterRef, isNewReveal, (el) => flipInLetter(el, reduced));
  return (
    <div ref={tileRef} style={tileStyle(size)} aria-hidden="true">
      {entry.faceUp ? (
        <span ref={letterRef} style={{ display: "inline-flex" }}>
          <LetterGlyph letter={entry.letter} size={size} />
        </span>
      ) : null}
    </div>
  );
}

export function LetterTiles({
  length,
  letters = "",
  revealed = 0,
  size = DEFAULT_SIZE,
  maxWidthPx = DEFAULT_MAX_WIDTH,
  live,
  label,
  style,
}: LetterTilesProps) {
  const cappedLength = Math.max(0, Math.min(length, MAX_TILES));
  const cappedRevealed = Math.max(0, Math.min(revealed, cappedLength));
  const tileSize = tileSizeFor(cappedLength, maxWidthPx, size);
  const entries = tileEntries(cappedLength, letters, cappedRevealed);
  const mountCounts = useMountCounts(cappedLength, cappedRevealed, live);
  const accessibleLabel = tilesLabel(
    label,
    cappedLength,
    letters,
    cappedRevealed,
  );
  return (
    <div
      aria-label={accessibleLabel}
      style={{
        display: "flex",
        gap: Math.round(tileSize * TILE_GAP_RATIO),
        ...style,
      }}
    >
      {entries.map((entry) => (
        <Tile
          key={entry.id}
          entry={entry}
          size={tileSize}
          mountCounts={mountCounts}
        />
      ))}
    </div>
  );
}
