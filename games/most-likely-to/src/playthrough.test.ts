// Full-room playthroughs through the SDK's bot harness.
import { describe, expect, it } from "vitest";
import type { SuperlativeContent } from "@opg/sdk";
import { createMemoryContentSource, runBotPlaythrough } from "@opg/sdk/testing";
import { mostLikelyTo } from "./index";

const PACK: SuperlativeContent = {
  kind: "superlatives",
  items: Array.from({ length: 24 }, (_, i) => ({
    id: `prompt-${i}`,
    prompt: `do thing number ${i}`,
  })),
};

const CONTENT_SOURCE = createMemoryContentSource([
  {
    meta: {
      id: "pack-most-likely-to",
      name: "Most Likely To Pack",
      kind: "superlatives",
      rating: "family",
      language: "en",
      itemCount: PACK.items.length,
    },
    content: PACK,
  },
]);

const AWARD_IDS = ["main-character", "crowd-reader", "owns-it", "wild-card"];

describe("most likely to bot playthroughs", () => {
  for (const players of [3, 8]) {
    it(`finishes a ${players}-player game with a mid-game disconnect and rejoin`, async () => {
      const content = await CONTENT_SOURCE.loadContent("superlatives", [
        "pack-most-likely-to",
      ]);
      expect(content.kind).toBe("superlatives");

      const result = runBotPlaythrough({
        game: mostLikelyTo,
        content,
        players,
        seed: 2000 + players,
        disconnectRejoin: true,
      });

      expect(result.finished).toBe(true);
      expect(result.steps).toBeGreaterThan(0);
      expect(Object.keys(result.scores)).toHaveLength(players);
      expect(result.rejoinedPlayerId).not.toBeNull();
      for (const award of result.awards) {
        expect(AWARD_IDS).toContain(award.id);
      }
    });
  }

  it("lists the pack through the memory content source", async () => {
    const packs = await CONTENT_SOURCE.listPacks();
    expect(packs).toHaveLength(1);
    expect(packs[0]?.id).toBe("pack-most-likely-to");
  });
});
