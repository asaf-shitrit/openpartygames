// The view schemas are the wire contract for the web app: every server view must
// parse and round-trip unchanged, at every phase the real game can be in.
import { describe, expect, it } from "vitest";
import { createRng } from "@opg/sdk";
import type { GameContext, WordPairContent } from "@opg/sdk";
import type { PlayerId } from "@opg/protocol";
import {
  imposterHostViewSchema,
  imposterPlayerViewSchema,
  onAction,
  onDeadline,
  setup,
  type ImposterPhase,
  type ImposterState,
} from "./index";
import { buildHostView, buildPlayerView } from "./views";
import { imposterPreviews } from "./ui/preview";

const CONTENT: WordPairContent = {
  kind: "word-pairs",
  items: [
    { crew: "apple", decoy: "apricot" },
    { crew: "bridge", decoy: "tunnel" },
    { crew: "coffee", decoy: "cocoa" },
    { crew: "dolphin", decoy: "whale" },
    { crew: "guitar", decoy: "violin" },
    { crew: "mountain", decoy: "hill" },
  ],
};

const ALL_PHASES: ImposterPhase[] = [
  "word-check",
  "clues",
  "vote",
  "reveal",
  "last-chance",
  "result",
];

function makeCtx(n = 4): GameContext<WordPairContent> {
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

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at index ${index}`);
  return item;
}

function imposterIdOf(state: ImposterState): PlayerId {
  const word = state.words[state.wordIndex];
  if (word === undefined) throw new Error("expected a current word");
  return word.imposterId;
}

function voteTargetFor(
  voter: PlayerId,
  imposterId: PlayerId,
  ids: readonly PlayerId[],
): PlayerId {
  if (voter !== imposterId) return imposterId;
  const other = ids.find((id) => id !== imposterId);
  if (other === undefined) throw new Error("expected another player");
  return other;
}

function previewView(surface: "host" | "phone") {
  const entry = imposterPreviews.find((p) => p.surface === surface);
  if (entry === undefined) throw new Error(`no ${surface} preview`);
  return entry.view;
}

/** Parses the host view and every player view for this state; records the phase. */
function expectViewsParse(
  state: ImposterState,
  seen: Set<ImposterPhase>,
): void {
  seen.add(state.phase);
  const host = buildHostView(state);
  expect(imposterHostViewSchema.parse(host)).toStrictEqual(host);
  for (const id of state.playerIds) {
    const player = buildPlayerView(state, id);
    expect(imposterPlayerViewSchema.parse(player)).toStrictEqual(player);
  }
}

describe("view schemas", () => {
  it("parses every preview sample and round-trips it unchanged", () => {
    for (const preview of imposterPreviews) {
      const schema =
        preview.surface === "host"
          ? imposterHostViewSchema
          : imposterPlayerViewSchema;
      expect(schema.parse(preview.view)).toStrictEqual(preview.view);
    }
  });

  it("parses views produced by the real game at every phase", () => {
    const ctx = makeCtx(4);
    const seen = new Set<ImposterPhase>();
    let state = setup(ctx);
    expectViewsParse(state, seen);

    state = onDeadline(state, ctx); // word-check -> clues
    expectViewsParse(state, seen);

    while (state.phase === "clues") {
      const speaker = at(state.clueOrder, state.clueIndex);
      state = onAction(state, speaker, { type: "done" }, ctx);
    }
    expectViewsParse(state, seen); // vote

    const imposterId = imposterIdOf(state);
    for (const voter of state.playerIds) {
      const target = voteTargetFor(voter, imposterId, state.playerIds);
      state = onAction(state, voter, { type: "vote", target }, ctx);
    }
    expectViewsParse(state, seen); // reveal (everyone voted the imposter)

    state = onDeadline(state, ctx); // reveal -> last-chance (caught)
    expectViewsParse(state, seen);

    state = onAction(
      state,
      imposterId,
      { type: "guess", text: "definitely wrong" },
      ctx,
    );
    expectViewsParse(state, seen); // result

    expect(seen).toEqual(new Set(ALL_PHASES));
  });

  it("rejects a host view missing a required field", () => {
    const host = imposterHostViewSchema.parse(previewView("host"));
    expect(
      imposterHostViewSchema.safeParse({ ...host, wordNumber: undefined })
        .success,
    ).toBe(false);
  });

  it("rejects a player view missing a required field", () => {
    const player = imposterPlayerViewSchema.parse(previewView("phone"));
    expect(
      imposterPlayerViewSchema.safeParse({ ...player, role: undefined })
        .success,
    ).toBe(false);
  });

  it("rejects a view with a wrong phase", () => {
    const host = previewView("host");
    const player = previewView("phone");
    expect(
      imposterHostViewSchema.safeParse({ ...host, phase: "nope" }).success,
    ).toBe(false);
    expect(
      imposterPlayerViewSchema.safeParse({ ...player, phase: "nope" }).success,
    ).toBe(false);
  });
});
