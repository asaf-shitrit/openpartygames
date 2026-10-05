export type * from "./types";
// Implemented in rng.ts and room.ts:
//   createRng(seed: number): Rng & { state(): number }   (restoreRng(state) continues a sequence)
//   createRoom(options: CreateRoomOptions): RoomCore
//   restoreRoom(snapshot: RoomSnapshot, games: AnyGame[], newToken: () => string): RoomCore
//   normalizeAnswer(text: string): string   (lowercase, trim, strip punctuation and leading a/an/the, collapse spaces)
export { dedupeContent, mergeContent } from "./content";
export { createRng, restoreRng } from "./rng";
export { createRoom, restoreRoom, START_TIMEOUT_MS, VIP_GRACE_MS } from "./room";
export { LEFT_PLAYER_GRACE_MS, pullInDeadline } from "./grace";
export { normalizeAnswer } from "./text";
export {
  doodleSchema,
  emptyDoodle,
  GAP_MS_CAP,
  GRID,
  MAX_INK_INDEX,
  MAX_POINTS_PER_DOODLE,
  MAX_POINTS_PER_STROKE,
  MAX_STROKES_PER_DOODLE,
  STROKE_MS_CAP,
  strokeSchema,
  TICK_MS,
} from "./doodle";
export type { Doodle, GridPoint, InkIndex, Stroke } from "./doodle";
