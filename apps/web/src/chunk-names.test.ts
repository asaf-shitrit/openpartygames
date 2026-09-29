import { describe, expect, it } from "vitest";
import { chunkFileName } from "./chunk-names";

describe("chunkFileName", () => {
  it("names a game's screens chunk after the game", () => {
    expect(chunkFileName("/repo/games/doodle-bluff/src/ui/index.ts")).toBe(
      "assets/game-doodle-bluff-[hash].js",
    );
  });

  it("leaves every other chunk to its default name", () => {
    expect(chunkFileName("/repo/apps/web/src/screens/QrCodeSvg.tsx")).toBe(
      "assets/[name]-[hash].js",
    );
    expect(chunkFileName(null)).toBe("assets/[name]-[hash].js");
  });
});
