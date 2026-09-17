// The view schemas are the wire contract for the web app: every server view must
// parse and round-trip unchanged, at every phase the real game can be in.
import { describe, expect, it } from "vitest";
import { createRng } from "@opg/sdk";
import type { GameContext, SuperlativeContent } from "@opg/sdk";
import {
  mltHostViewSchema,
  mltPlayerViewSchema,
  onAction,
  onDeadline,
  setup,
} from "./index";
import { buildHostView, buildPlayerView } from "./views";
import { mostLikelyToPreviews } from "./ui/preview";

const PROMPTS: SuperlativeContent["items"] = Array.from(
  { length: 6 },
  (_, i) => ({ id: `prompt-${i}`, prompt: `do thing number ${i}` }),
);
const CONTENT: SuperlativeContent = { kind: "superlatives", items: PROMPTS };

function makeCtx(n = 4): GameContext<SuperlativeContent> {
  const players = Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    avatar: null,
  }));
  return {
    players,
    connectedIds: players.map((p) => p.id),
    rng: createRng(1),
    now: 1000,
    content: CONTENT,
  };
}

describe("real Most Likely To views", () => {
  it("host view parses at the vote and reveal phase", () => {
    const c = makeCtx(3);
    let state = setup(c);
    const hostVote = buildHostView(state);
    expect(mltHostViewSchema.parse(hostVote)).toEqual(hostVote);

    state = onAction(state, "p1", { type: "vote", target: "p2" }, c);
    state = onAction(state, "p2", { type: "vote", target: "p2" }, c);
    state = onAction(state, "p3", { type: "vote", target: "p1" }, c);
    expect(state.phase).toBe("reveal");
    const hostReveal = buildHostView(state);
    expect(mltHostViewSchema.parse(hostReveal)).toEqual(hostReveal);
  });

  it("player view parses at the vote and reveal phase, for every player", () => {
    const c = makeCtx(3);
    let state = setup(c);
    const playerVote = buildPlayerView(state, "p1");
    expect(mltPlayerViewSchema.parse(playerVote)).toEqual(playerVote);

    state = onAction(state, "p1", { type: "vote", target: "p2" }, c);
    state = onAction(state, "p2", { type: "vote", target: "p2" }, c);
    state = onAction(state, "p3", { type: "vote", target: "p1" }, c);
    expect(state.phase).toBe("reveal");
    for (const id of state.playerIds) {
      const playerReveal = buildPlayerView(state, id);
      expect(mltPlayerViewSchema.parse(playerReveal)).toEqual(playerReveal);
    }
  });

  it("the deadline handler keeps producing parseable views through a full cycle", () => {
    const c = makeCtx(3);
    let state = setup(c);
    state = onDeadline(state, c); // no votes -> reveal
    expect(mltHostViewSchema.parse(buildHostView(state))).toBeTruthy();
    state = onDeadline(state, c); // -> next vote
    expect(mltHostViewSchema.parse(buildHostView(state))).toBeTruthy();
  });
});

describe("mostLikelyToPreviews", () => {
  it("parses each preview view with the schema matching its surface", () => {
    expect(mostLikelyToPreviews.length).toBeGreaterThan(0);
    for (const preview of mostLikelyToPreviews) {
      const schema =
        preview.surface === "host" ? mltHostViewSchema : mltPlayerViewSchema;
      const result = schema.safeParse(preview.view);
      expect(
        result.success,
        `${preview.label}: ${JSON.stringify(result)}`,
      ).toBe(true);
    }
  });
});

describe("schema rejects malformed views", () => {
  it("rejects a host view missing a required field", () => {
    const view = {
      phase: "vote",
      roundNumber: 1,
      roundCount: 20,
      prompt: "x",
      playerIds: ["p1"],
      votedIds: [],
      totals: {},
      reveal: null,
      // pointsThisRound is missing
    };
    expect(mltHostViewSchema.safeParse(view).success).toBe(false);
  });

  it("rejects an unknown phase", () => {
    const view = {
      phase: "reveal-ish",
      roundNumber: 1,
      roundCount: 20,
      prompt: "x",
      playerIds: ["p1"],
      votedIds: [],
      totals: {},
      reveal: null,
      pointsThisRound: null,
    };
    expect(mltHostViewSchema.safeParse(view).success).toBe(false);
  });

  it("rejects a player view missing a required field", () => {
    const view = {
      phase: "vote",
      roundNumber: 1,
      roundCount: 20,
      prompt: "x",
      voteCandidates: ["p1"],
      myVote: null,
      votedCount: 0,
      // playerCount is missing
      totals: {},
      reveal: null,
      myPoints: null,
    };
    expect(mltPlayerViewSchema.safeParse(view).success).toBe(false);
  });
});
