// The view schemas are the wire contract for the web app: every server view must
// parse and round-trip unchanged, at every phase the real game can be in.
import { describe, expect, it } from "vitest";
import { createRng } from "@opg/sdk";
import type { FactContent, GameContext } from "@opg/sdk";
import type { PlayerId } from "@opg/protocol";
import {
  buildHostView,
  buildPlayerView,
  onAction,
  ronHostViewSchema,
  ronPlayerViewSchema,
  setup,
  type RonPhase,
  type RonState,
} from "./index";
import { realOrNahPreviews } from "./ui/preview";

const CONTENT: FactContent = {
  kind: "facts",
  items: [
    {
      id: "emu-war",
      prompt: "In 1932, the Australian army went to war against ____ and lost.",
      answer: "emus",
      alternates: ["emu"],
      decoys: ["kangaroos", "rabbits", "cane toads"],
      source: {
        title: "Emu War",
        url: "https://en.wikipedia.org/wiki/Emu_War",
      },
    },
    {
      id: "scotland-unicorn",
      prompt: "Scotland's national animal is the ____.",
      answer: "unicorn",
      alternates: ["unicorns"],
      decoys: ["red deer", "golden eagle", "highland cow"],
      source: {
        title: "National symbols of Scotland",
        url: "https://en.wikipedia.org/wiki/National_symbols_of_Scotland",
      },
    },
    {
      id: "wombat-cubes",
      prompt: "Wombats are famous for pooping little ____.",
      answer: "cubes",
      alternates: ["cube"],
      decoys: ["stars", "spirals", "pyramids"],
      source: { title: "Wombat", url: "https://en.wikipedia.org/wiki/Wombat" },
    },
  ],
};

const ALL_PHASES: RonPhase[] = ["write", "vote", "reveal"];

function makeCtx(n = 4): GameContext<FactContent> {
  const players = Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    avatar: null,
  }));
  return {
    players,
    connectedIds: players.map((p) => p.id),
    rng: createRng(7),
    now: 1000,
    content: CONTENT,
  };
}

function pickableOptionId(state: RonState, playerId: PlayerId): string {
  const option = (state.options ?? []).find((o) => o.authorId !== playerId);
  if (option === undefined) throw new Error("no pickable option");
  return option.id;
}

function previewView(surface: "host" | "phone") {
  const entry = realOrNahPreviews.find((p) => p.surface === surface);
  if (entry === undefined) throw new Error(`no ${surface} preview`);
  return entry.view;
}

/** Parses the host view and every player view for this state; records the phase. */
function expectViewsParse(state: RonState, seen: Set<RonPhase>): void {
  seen.add(state.phase);
  const host = buildHostView(state);
  expect(ronHostViewSchema.parse(host)).toStrictEqual(host);
  for (const id of state.playerIds) {
    const player = buildPlayerView(state, id);
    expect(ronPlayerViewSchema.parse(player)).toStrictEqual(player);
  }
}

describe("view schemas", () => {
  it("parses every preview sample and round-trips it unchanged", () => {
    for (const preview of realOrNahPreviews) {
      const schema =
        preview.surface === "host" ? ronHostViewSchema : ronPlayerViewSchema;
      expect(schema.parse(preview.view)).toStrictEqual(preview.view);
    }
  });

  it("parses views produced by the real game at every phase", () => {
    const ctx = makeCtx(4);
    const seen = new Set<RonPhase>();
    let state = setup(ctx);
    expectViewsParse(state, seen);

    for (const id of state.playerIds) {
      state = onAction(state, id, { type: "lie", text: `lie ${id}` }, ctx);
    }
    expectViewsParse(state, seen); // vote (everyone submitted)

    for (const id of state.playerIds) {
      const optionId = pickableOptionId(state, id);
      state = onAction(state, id, { type: "pick", optionId }, ctx);
    }
    expectViewsParse(state, seen); // reveal (everyone picked)

    expect(seen).toEqual(new Set(ALL_PHASES));
  });

  it("rejects a host view missing a required field", () => {
    const host = ronHostViewSchema.parse(previewView("host"));
    expect(
      ronHostViewSchema.safeParse({ ...host, factNumber: undefined }).success,
    ).toBe(false);
  });

  it("rejects a player view missing a required field", () => {
    const player = ronPlayerViewSchema.parse(previewView("phone"));
    expect(
      ronPlayerViewSchema.safeParse({ ...player, myPoints: undefined }).success,
    ).toBe(false);
  });

  it("rejects a view with a wrong phase", () => {
    const host = previewView("host");
    const player = previewView("phone");
    expect(
      ronHostViewSchema.safeParse({ ...host, phase: "nope" }).success,
    ).toBe(false);
    expect(
      ronPlayerViewSchema.safeParse({ ...player, phase: "nope" }).success,
    ).toBe(false);
  });
});
