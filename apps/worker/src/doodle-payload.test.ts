// Measures what Doodle Bluff actually puts on the wire (plan/0003-doodle-bluff.md, slice 1 "done
// when", "## No-TV mode" and D5), instead of leaving the plan's figures as estimates: the title
// phase's room view with one drawing in it, and the gallery frame that carries all sixteen, both
// as the TV's host frame and as a no-TV player frame (own view plus `stage`). Drives the real
// GameDefinition through its real chunk actions, so the numbers come from the view builders.
import { describe, expect, it } from "vitest";
import { createRng, GAP_MS_CAP, STROKE_MS_CAP } from "@opg/sdk";
import type { DrawingPromptContent, GameContext, GamePlayer, Stroke } from "@opg/sdk";
import {
  doodleBluff,
  drawingIdOf,
  type DoodleHostView,
  type DoodlePhase,
  type DoodlePlayerView,
  type DoodleState,
} from "@opg/game-doodle-bluff";

const PLAYER_COUNT = 8;
const CHUNK_POINTS = 400;

const CONTENT: DrawingPromptContent = {
  kind: "drawing-prompts",
  items: Array.from({ length: PLAYER_COUNT * 2 }, (_, i) => ({
    id: `prompt-${i}`,
    prompt: `a giraffe riding a bicycle ${i}`,
    houseTitles: ["a tall lamp", "a broken ladder", "two sad trees", "a very long sock"],
  })),
};

interface InkBudget {
  strokes: number;
  pointsPerStroke: number;
  atCaps: boolean;
}

/** ~15 strokes, ~375 points: the plan's typical drawing (packages/ui/src/doodle/size.test.ts). */
const TYPICAL: InkBudget = { strokes: 15, pointsPerStroke: 25, atCaps: false };
/** 64 strokes, 1152 points, every timing at its cap: the most a drawing can hold. */
const AT_CAPS: InkBudget = { strokes: 64, pointsPerStroke: 18, atCaps: true };

function makePlayers(count: number): GamePlayer[] {
  return Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, avatar: null }));
}

/** A wandering stroke that stays on the grid, delta-encoded the way the pad sends it. */
function wanderingStroke(ink: InkBudget, index: number): Stroke {
  const p: number[] = [512, 512];
  let angle = index;
  for (let i = 1; i < ink.pointsPerStroke; i += 1) {
    angle += 0.7;
    p.push(Math.round(Math.cos(angle) * 15), Math.round(Math.sin(angle) * 15));
  }
  const d = ink.atCaps ? STROKE_MS_CAP : 100 + (index % 20) * 10;
  const g = ink.atCaps ? GAP_MS_CAP : 20 + (index % 10) * 5;
  return { c: index % 6, d, g, p };
}

/** The drawing split into "strokes" chunks that each fit MAX_POINTS_PER_CHUNK. */
function chunksOf(ink: InkBudget): Stroke[][] {
  const perChunk = Math.floor(CHUNK_POINTS / ink.pointsPerStroke);
  const chunks: Stroke[][] = [];
  for (let start = 0; start < ink.strokes; start += perChunk) {
    const end = Math.min(start + perChunk, ink.strokes);
    chunks.push(Array.from({ length: end - start }, (_, i) => wanderingStroke(ink, start + i)));
  }
  return chunks;
}

class Driver {
  readonly players = makePlayers(PLAYER_COUNT);
  readonly playerIds = this.players.map((p) => p.id);
  private readonly rng = createRng(7);
  now = 0;
  state: DoodleState;

  constructor() {
    this.state = doodleBluff.setup(this.ctx());
  }

  ctx(): GameContext<DrawingPromptContent> {
    return { players: this.players, connectedIds: this.playerIds, rng: this.rng, now: this.now, content: CONTENT };
  }

  /** Every player submits both drawings through the real chunk path, then marks them done. */
  drawEverything(ink: InkBudget): void {
    for (const playerId of this.playerIds) {
      for (const slot of [0, 1] as const) this.drawOne(playerId, drawingIdOf(playerId, slot), ink);
    }
  }

  private drawOne(playerId: string, drawingId: string, ink: InkBudget): void {
    let from = 0;
    for (const strokes of chunksOf(ink)) {
      this.state = doodleBluff.onAction(this.state, playerId, { type: "strokes", drawingId, from, strokes }, this.ctx());
      from += strokes.length;
    }
    this.state = doodleBluff.onAction(this.state, playerId, { type: "doodle-done", drawingId }, this.ctx());
  }

  /** Bots title and vote; a phase with nothing left to do runs out its deadline. */
  advanceTo(phase: DoodlePhase): void {
    for (let guard = 0; this.state.phase !== phase; guard += 1) {
      if (guard > 2000) throw new Error(`never reached the ${phase} phase`);
      if (!this.oneBotActs()) this.expire();
    }
  }

  private oneBotActs(): boolean {
    for (const id of this.playerIds) {
      const action = doodleBluff.bot(doodleBluff.playerView(this.state, id, { now: this.now }), this.rng);
      if (action === null) continue;
      this.state = doodleBluff.onAction(this.state, id, action, this.ctx());
      return true;
    }
    return false;
  }

  private expire(): void {
    this.now = (doodleBluff.nextDeadline(this.state) ?? this.now) + 1;
    this.state = doodleBluff.onDeadline(this.state, this.ctx());
  }

  hostView(): DoodleHostView {
    return doodleBluff.hostView(this.state, { now: this.now });
  }

  playerView(): DoodlePlayerView {
    const [firstId] = this.playerIds;
    if (firstId === undefined) throw new Error("no players");
    return doodleBluff.playerView(this.state, firstId, { now: this.now });
  }
}

function frameBytes(view: DoodleHostView | DoodlePlayerView, stage: DoodleHostView | null, now: number): number {
  const frame = { id: doodleBluff.id, view, stage, deadline: now + 1000, timerStartedAt: now };
  return new TextEncoder().encode(JSON.stringify(frame)).length;
}

interface Measured {
  titleHost: number;
  galleryHost: number;
  galleryNoTvPlayer: number;
}

function measure(ink: InkBudget): Measured {
  const game = new Driver();
  game.drawEverything(ink);
  game.advanceTo("title");
  const titleHost = frameBytes(game.hostView(), null, game.now);
  game.advanceTo("gallery");
  const gallery = game.hostView().gallery ?? [];
  expect(gallery).toHaveLength(PLAYER_COUNT * 2);
  expect(gallery.every((entry) => entry.doodle.s.length === ink.strokes)).toBe(true);
  return {
    titleHost,
    galleryHost: frameBytes(game.hostView(), null, game.now),
    galleryNoTvPlayer: frameBytes(game.playerView(), game.hostView(), game.now),
  };
}

// Kept as ranges, not exact equality, so an unrelated view-ink change does not fail this over a
// few bytes; widen them rather than delete them if a real change moves the numbers, and update the
// figures recorded in plan/0003-doodle-bluff.md to match.
describe("Doodle Bluff payload size", () => {
  it("measures 8 players with 16 typical drawings", () => {
    const m = measure(TYPICAL);
    // Observed: title host frame 3,209 B; gallery host frame 46,665 B; no-TV player frame 47,102 B.
    expect(m.titleHost).toBeGreaterThan(2_500);
    expect(m.titleHost).toBeLessThan(4_500);
    expect(m.galleryHost).toBeGreaterThan(38_000);
    expect(m.galleryHost).toBeLessThan(56_000);
    expect(m.galleryNoTvPlayer).toBeGreaterThan(m.galleryHost);
    expect(m.galleryNoTvPlayer - m.galleryHost).toBeLessThan(2_000);
  });

  it("measures 8 players with 16 drawings at every cap", () => {
    const m = measure(AT_CAPS);
    // Observed: title host frame 9,652 B; gallery host frame 149,753 B; no-TV player frame 150,190 B.
    expect(m.titleHost).toBeGreaterThan(8_000);
    expect(m.titleHost).toBeLessThan(12_000);
    expect(m.galleryHost).toBeGreaterThan(125_000);
    expect(m.galleryHost).toBeLessThan(180_000);
    expect(m.galleryNoTvPlayer).toBeGreaterThan(m.galleryHost);
    expect(m.galleryNoTvPlayer - m.galleryHost).toBeLessThan(2_000);
  });
});
