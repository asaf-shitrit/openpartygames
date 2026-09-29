// Names the lazy chunks after what they hold. Every game's screens come from a `ui/index.ts`,
// so by default all four emitted as `ui-<hash>.js` and a network panel could not tell which
// game was which.

const GAME_SCREENS = /\/games\/([^/]+)\/src\/ui\//;

/** The output file pattern for a chunk whose entry module is `facadeModuleId`. */
export function chunkFileName(facadeModuleId: string | null): string {
  const game = facadeModuleId?.match(GAME_SCREENS)?.[1];
  if (game === undefined) return "assets/[name]-[hash].js";
  return `assets/game-${game}-[hash].js`;
}
