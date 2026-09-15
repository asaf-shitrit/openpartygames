// Full-room playthroughs through the SDK's bot harness.
import { describe, expect, it } from "vitest";
import type { WordPairContent } from "@opg/sdk";
import { runBotPlaythrough } from "@opg/sdk/testing";
import { imposter } from "./index";

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

describe("imposter bot playthroughs", () => {
  for (const players of [3, 8]) {
    it(`finishes a ${players}-player game with a mid-game disconnect and rejoin`, () => {
      const result = runBotPlaythrough({
        game: imposter,
        content: CONTENT,
        players,
        seed: 1000 + players,
        disconnectRejoin: true,
      });

      expect(result.finished).toBe(true);
      expect(result.steps).toBeGreaterThan(0);
      expect(Object.keys(result.scores)).toHaveLength(players);
      expect(result.winnerIds.length).toBeGreaterThan(0);
      expect(result.rejoinedPlayerId).not.toBeNull();
    });
  }
});
