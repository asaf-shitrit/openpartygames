import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@opg/protocol";

/**
 * Largest multiple of the alphabet size that fits in a byte. Bytes at or above
 * it are rejected so every code is uniform (no modulo bias).
 */
const REJECT_AT =
 Math.floor(256 / ROOM_CODE_ALPHABET.length) * ROOM_CODE_ALPHABET.length;

/**
 * Maps random bytes to a room code, skipping bytes that would bias the result.
 * Returns null when the bytes run out before a full code is built.
 */
export function roomCodeFromBytes(bytes: Iterable<number>): string | null {
 let code = "";
 for (const byte of bytes) {
  if (byte >= REJECT_AT) continue;
  code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
  if (code.length === ROOM_CODE_LENGTH) return code;
 }
 return null;
}

/** A fresh room code, uniform over ROOM_CODE_ALPHABET. */
export function randomRoomCode(): string {
 for (;;) {
  const code = roomCodeFromBytes(
   crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH * 2)),
  );
  if (code !== null) return code;
 }
}
