export type * from "./types";
// Implemented in rng.ts and room.ts:
//   createRng(seed: number): Rng & { state(): number }   (restoreRng(state) continues a sequence)
//   createRoom(options: CreateRoomOptions): RoomCore
//   restoreRoom(snapshot: RoomSnapshot, games: AnyGame[], newToken: () => string): RoomCore
//   normalizeAnswer(text: string): string   (lowercase, trim, strip punctuation and leading a/an/the, collapse spaces)
export { createRng, restoreRng } from "./rng";
export { createRoom, restoreRoom } from "./room";
export { normalizeAnswer } from "./text";
