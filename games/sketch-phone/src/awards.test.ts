import { describe, expect, it } from "vitest";
import type { DrawingPromptContent, GameContext } from "@opg/sdk";
import { createRng } from "@opg/sdk";
import { setup } from "./index";
import { sketchPhoneAwards } from "./awards";
import { linkIdOf, type ChainLink, type SketchState } from "./state";

const CONTENT: DrawingPromptContent = { kind: "drawing-prompts", items: [] };

function makeCtx(n: number): GameContext<DrawingPromptContent> {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, avatar: null }));
  return { players, connectedIds: players.map((p) => p.id), rng: createRng(3), now: 0, content: CONTENT };
}

function filled(link: ChainLink, text: string): ChainLink {
  if (link.kind === "drawing") return { ...link, done: true, doodle: { v: 1, s: [{ c: 0, d: 10, g: 0, p: [0, 0, 1, 1] }] } };
  return { ...link, done: true, text };
}

/** Every link filled, so a link id is always valid, plus the votes each test wants. */
function scored(votes: Record<string, string[]>): SketchState {
  const state = setup(makeCtx(3));
  const links: Record<string, ChainLink> = {};
  for (const [id, link] of Object.entries(state.links)) links[id] = filled(link, `words ${id}`);
  return { ...state, links, voters: votes };
}

describe("sketch phone awards", () => {
  it("gives nothing away when nobody voted", () => {
    expect(sketchPhoneAwards(scored({}))).toEqual([]);
  });

  it("crowns the most-voted link, its drawing and its words", () => {
    const awards = sketchPhoneAwards(
      scored({
        [linkIdOf(0, 0)]: ["p2", "p3"],
        [linkIdOf(0, 1)]: ["p1"],
      }),
    );
    expect(awards).toEqual([
      { id: "favourite", playerIds: ["p1"], value: 2 },
      { id: "sharpest-pencil", playerIds: ["p2"], value: 1 },
      { id: "wordsmith", playerIds: ["p1"], value: 2 },
    ]);
  });

  it("shares an award between everyone on the same number", () => {
    const awards = sketchPhoneAwards(
      scored({
        [linkIdOf(0, 0)]: ["p2"],
        [linkIdOf(1, 0)]: ["p3"],
      }),
    );
    expect(awards.find((award) => award.id === "favourite")).toEqual({
      id: "favourite",
      playerIds: ["p1", "p2"],
      value: 1,
    });
  });

  it("forgets a player who left, votes and all", () => {
    const state = scored({ [linkIdOf(0, 1)]: ["p1", "p2"] });
    const left: SketchState = { ...state, playerIds: state.playerIds.filter((id) => id !== "p2") };
    expect(sketchPhoneAwards(left)).toEqual([]);
  });

  it("never lists more than the platform's three awards", () => {
    const awards = sketchPhoneAwards(
      scored({
        [linkIdOf(0, 0)]: ["p2"],
        [linkIdOf(0, 1)]: ["p1"],
        [linkIdOf(1, 1)]: ["p3"],
      }),
    );
    expect(awards.length).toBeLessThanOrEqual(3);
  });
});
