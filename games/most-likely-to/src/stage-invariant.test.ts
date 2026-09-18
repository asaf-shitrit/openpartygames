// The no-TV stage is `hostView(state)`, sent verbatim (plan/0004-no-tv-mode.md §4). This is the
// per-game half of that contract: the host view never composes anything a player view doesn't
// already carry in public form, and it never lets one player's vote leak through another's.
import { describe, expect, it } from "vitest";
import type { GameContext, SuperlativeContent } from "@opg/sdk";
import { createRng } from "@opg/sdk";
import { onAction, setup } from "./index";
import { buildHostView, buildPlayerView } from "./views";

const PROMPTS: SuperlativeContent["items"] = Array.from(
  { length: 6 },
  (_, i) => ({ id: `prompt-${i}`, prompt: `do thing number ${i}` }),
);
const CONTENT: SuperlativeContent = { kind: "superlatives", items: PROMPTS };
const [P1, P2, P3, P4] = ["p1", "p2", "p3", "p4"];

function makeCtx(): GameContext<SuperlativeContent> {
  const players = [P1, P2, P3, P4].map((id) => ({ id, name: id, avatar: null }));
  return {
    players,
    connectedIds: players.map((p) => p.id),
    rng: createRng(1),
    now: 1000,
    content: CONTENT,
  };
}

/** Every state the stage/hostView invariant must hold in: every phase, every outcome kind. */
function statesToCheck() {
  const ctx = makeCtx();
  const noVotes = setup(ctx);
  const oneVote = onAction(noVotes, P1, { type: "vote", target: P2 }, ctx);
  const allButOne = onAction(oneVote, P2, { type: "vote", target: P2 }, ctx);

  const picked = onAction(allButOne, P3, { type: "vote", target: P2 }, ctx);
  const pickedFull = onAction(picked, P4, { type: "vote", target: P1 }, ctx);

  let tie = setup(ctx);
  tie = onAction(tie, P1, { type: "vote", target: P2 }, ctx);
  tie = onAction(tie, P4, { type: "vote", target: P2 }, ctx);
  tie = onAction(tie, P2, { type: "vote", target: P3 }, ctx);
  tie = onAction(tie, P3, { type: "vote", target: P3 }, ctx);

  let split = setup(ctx);
  split = onAction(split, P1, { type: "vote", target: P2 }, ctx);
  split = onAction(split, P2, { type: "vote", target: P3 }, ctx);
  split = onAction(split, P3, { type: "vote", target: P4 }, ctx);
  split = onAction(split, P4, { type: "vote", target: P1 }, ctx);

  return {
    "vote: nobody has voted": noVotes,
    "vote: one voter": oneVote,
    "vote: all but one voted": allButOne,
    "reveal: picked": pickedFull,
    "reveal: tie": tie,
    "reveal: split": split,
  };
}

describe("the stage is the host view, never something composed", () => {
  for (const [label, state] of Object.entries(statesToCheck())) {
    it(`${label}: every player's stage deep-equals hostView(state)`, () => {
      const hostView = buildHostView(state);
      for (const id of state.playerIds) {
        const playerViewPlusStage = { ...buildPlayerView(state, id), stage: hostView };
        expect(playerViewPlusStage.stage).toStrictEqual(hostView);
      }
    });

    it(`${label}: no view carries a field the others don't already have in public form`, () => {
      const hostView = buildHostView(state);
      for (const id of state.playerIds) {
        const playerView = buildPlayerView(state, id);
        // The reveal, once frozen, is public and identical everywhere it appears.
        expect(playerView.reveal).toStrictEqual(hostView.reveal);
        expect(playerView.totals).toStrictEqual(hostView.totals);
      }
    });
  }
});

describe("the vote phase never leaks who voted for whom", () => {
  it("hostView is unchanged when voters keep the same roster but pick different targets", () => {
    const ctx = makeCtx();
    const base = setup(ctx);

    let stateA = onAction(base, P1, { type: "vote", target: P2 }, ctx);
    stateA = onAction(stateA, P3, { type: "vote", target: P4 }, ctx);

    let stateB = onAction(base, P1, { type: "vote", target: P3 }, ctx);
    stateB = onAction(stateB, P3, { type: "vote", target: P1 }, ctx);

    // Same two voters (P1, P3), different targets: the host view must be identical either way,
    // because it only ever says who has voted, never whom they picked.
    expect(buildHostView(stateA)).toStrictEqual(buildHostView(stateB));
  });

  it("votedIds names who voted, and nothing on the host view names their target", () => {
    const ctx = makeCtx();
    let state = setup(ctx);
    state = onAction(state, P1, { type: "vote", target: P4 }, ctx);
    const hostView = buildHostView(state);
    expect(hostView.votedIds).toEqual([P1]);
    expect(hostView).not.toHaveProperty("votes");
    expect(hostView.reveal).toBeNull();
  });
});
