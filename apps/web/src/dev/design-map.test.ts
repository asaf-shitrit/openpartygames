// Every design artboard names the preview that renders it, and that preview has to exist.
//
// design/canvas.json places each design/*.dc.html artboard on a page. Its `screen` field says
// which /dev/screens case is the built version of that design, by game and preview label —
// labels rather than `game/index` ids, because an id shifts whenever a preview is inserted
// above it. Without this, renaming or deleting a preview fixture silently orphans its design,
// and the only record of which screen a design was for is the artboard's title.
//
// `screen: null` is an explicit "nothing renders this design yet". Leaving the field out is not
// allowed, so a new artboard has to decide. The style directions that weren't picked are
// exempt: they are not designs for any screen.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SCREENS } from "./screens";
import type { Surface } from "./screens";

const repoDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

/** Pages whose artboards are not designs for a screen. */
const UNMAPPED_PAGES = new Set(["style-options"]);

const screenRefSchema = z.object({ game: z.string(), label: z.string() }).strict();

const artboardSchema = z.object({
  file: z.string(),
  title: z.string(),
  page: z.string(),
  screen: screenRefSchema.nullable().optional(),
});

const canvasSchema = z.object({ artboards: z.array(artboardSchema) });

type Artboard = z.infer<typeof artboardSchema>;
type ScreenRef = z.infer<typeof screenRefSchema>;

const canvas = canvasSchema.parse(
  JSON.parse(readFileSync(path.join(repoDir, "design", "canvas.json"), "utf8")),
);

const mappedArtboards = canvas.artboards.filter((board) => !UNMAPPED_PAGES.has(board.page));

function keyOf(game: string, label: string): string {
  return `${game} › ${label}`;
}

const screenByKey = new Map(SCREENS.map((screen) => [keyOf(screen.gameId, screen.label), screen]));

/** The surface an artboard is drawn for, read from its title ("TV · …" or "Phone · …"). */
function surfaceOf(board: Artboard): Surface | null {
  if (board.title.startsWith("TV ")) return "host";
  if (board.title.startsWith("Phone ")) return "phone";
  return null;
}

function refsOf(boards: readonly Artboard[]): Array<{ board: Artboard; ref: ScreenRef }> {
  return boards.flatMap((board) => (board.screen ? [{ board, ref: board.screen }] : []));
}

describe("design/canvas.json screen mapping", () => {
  it("gives every artboard outside the style options a screen field, even if null", () => {
    const missing = mappedArtboards.filter((board) => board.screen === undefined);
    expect(missing.map((board) => board.file)).toEqual([]);
  });

  it("gives no style-option artboard a screen", () => {
    const options = canvas.artboards.filter((board) => UNMAPPED_PAGES.has(board.page));
    expect(options.length).toBeGreaterThan(0);
    expect(options.filter((board) => board.screen !== undefined)).toEqual([]);
  });

  it("names a preview that exists for every mapped artboard", () => {
    const orphaned = refsOf(mappedArtboards)
      .filter(({ ref }) => !screenByKey.has(keyOf(ref.game, ref.label)))
      .map(({ board, ref }) => `${board.file} → ${keyOf(ref.game, ref.label)}`);
    expect(orphaned).toEqual([]);
  });

  it("maps a TV artboard to a host screen and a phone artboard to a phone screen", () => {
    const crossed = refsOf(mappedArtboards)
      .filter(({ board, ref }) => {
        const screen = screenByKey.get(keyOf(ref.game, ref.label));
        return screen !== undefined && screen.surface !== surfaceOf(board);
      })
      .map(({ board }) => board.file);
    expect(crossed).toEqual([]);
  });

  it("can tell every preview apart by game and label, which is what the mapping relies on", () => {
    const keys = SCREENS.map((screen) => keyOf(screen.gameId, screen.label));
    const repeated = keys.filter((key, index) => keys.indexOf(key) !== index);
    expect(repeated).toEqual([]);
  });

  it("reads the artboard surface from its title", () => {
    const board = { file: "x", page: "p" };
    expect(surfaceOf({ ...board, title: "TV · Lobby" })).toBe("host");
    expect(surfaceOf({ ...board, title: "Phone · Join" })).toBe("phone");
    expect(surfaceOf({ ...board, title: "A · Sticker Shop" })).toBeNull();
  });
});
