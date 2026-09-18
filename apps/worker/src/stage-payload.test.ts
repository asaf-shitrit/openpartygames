// Measures the wire cost of ActiveGameView.stage (plan/0004-no-tv-mode.md decision #3):
// an in-game player frame for Imposter's reveal, the largest host view, with and
// without `stage` attached. Drives the real GameDefinition directly (no RoomCore
// needed) so the numbers come from the actual view builders, not an estimate.
import { describe, expect, it } from "vitest";
import { createRng } from "@opg/sdk";
import type { GameContext, GamePlayer, WordPairContent } from "@opg/sdk";
import {
  imposter,
  type ImposterHostView,
  type ImposterPlayerView,
} from "@opg/game-imposter";

const PLAYER_COUNT = 8;

const CONTENT: WordPairContent = {
  kind: "word-pairs",
  items: [
    { crew: "apple", decoy: "apricot" },
    { crew: "bridge", decoy: "tunnel" },
    { crew: "coffee", decoy: "cocoa" },
    { crew: "dolphin", decoy: "whale" },
    { crew: "guitar", decoy: "violin" },
    { crew: "mountain", decoy: "hill" },
    { crew: "pizza", decoy: "calzone" },
    { crew: "winter", decoy: "autumn" },
  ],
};

function makePlayers(count: number): GamePlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: null,
  }));
}

/** Drives the real imposter GameDefinition with bots until the reveal phase, no RoomCore involved. */
function driveToReveal() {
  const players = makePlayers(PLAYER_COUNT);
  const playerIds = players.map((p) => p.id);
  const rng = createRng(42);
  let now = 0;
  const ctx = (): GameContext<WordPairContent> => ({
    players,
    connectedIds: playerIds,
    rng,
    now,
    content: CONTENT,
  });

  let state = imposter.setup(ctx());
  let guard = 0;
  while (state.phase !== "reveal") {
    guard += 1;
    if (guard > 1000) throw new Error("never reached the reveal phase");
    let acted = false;
    for (const id of playerIds) {
      const view = imposter.playerView(state, id, { now });
      const action = imposter.bot(view, rng);
      if (action === null) continue;
      state = imposter.onAction(state, id, action, ctx());
      acted = true;
      break;
    }
    if (!acted) {
      now = (state.deadline ?? now) + 1;
      state = imposter.onDeadline(state, ctx());
    }
  }
  return { state, playerIds, now };
}

function frameBytes(
  view: ImposterPlayerView,
  stage: ImposterHostView | null,
  deadline: number | null,
  now: number,
): number {
  const frame = { id: imposter.id, view, stage, deadline, timerStartedAt: now };
  return new TextEncoder().encode(JSON.stringify(frame)).length;
}

describe("stage payload size", () => {
  it("measures a player frame for Imposter's reveal, with and without stage", () => {
    const { state, playerIds, now } = driveToReveal();
    expect(state.phase).toBe("reveal");
    const [firstId] = playerIds;
    if (firstId === undefined) throw new Error("no players");

    const playerView = imposter.playerView(state, firstId, { now });
    const hostView = imposter.hostView(state, { now });

    const withoutStage = frameBytes(playerView, null, state.deadline, now);
    const withStage = frameBytes(playerView, hostView, state.deadline, now);

    // Measured at 8 players (the max room size) on the reveal phase, the largest
    // host view in the platform (plan/0004-no-tv-mode.md §3, slice 2 "done when").
    // Observed: 572 bytes without stage, 1215 bytes with stage (+643 bytes). Kept
    // as ranges, not exact equality, so an unrelated view-shape change does not
    // fail this test over a few bytes; widen the ranges rather than delete them
    // if a real change moves the numbers.
    expect(withoutStage).toBeGreaterThan(400);
    expect(withoutStage).toBeLessThan(800);
    expect(withStage).toBeGreaterThan(1000);
    expect(withStage).toBeLessThan(1600);
    expect(withStage - withoutStage).toBeLessThan(1000);
  });
});
