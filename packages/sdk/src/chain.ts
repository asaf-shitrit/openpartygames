// The chain capability: a turn model where each player's output becomes the next player's
// input, one link at a time. Sketch Phone is its first user (plan/0005-sketch-phone.md), and it
// stays here rather than in that game because the arithmetic — who holds which chain in which
// round — is the same for any chain game, and getting it wrong in a game is hard to see.
//
// A chain is one row of links. Every player seeds one chain and every chain ends up with exactly
// one link per player, so a room of n players plays n chains of n links. Links alternate between
// free text ("words") and a drawing, starting with words: the seed is a phrase, the next player
// draws it, the next describes the drawing, and so on.

export type ChainStepKind = "words" | "drawing";

/** The kind of the link at `step`, counting the seed as step 0. */
export function stepKind(step: number): ChainStepKind {
  return step % 2 === 0 ? "words" : "drawing";
}

/** Links in every chain of a room: one per player. */
export function chainLength(playerCount: number): number {
  return Math.max(0, playerCount);
}

/** How many transfer rounds follow the seed: everyone works on one link per round. */
export function transferRounds(playerCount: number): number {
  return Math.max(0, playerCount - 1);
}

function wrap(value: number, size: number): number {
  if (size <= 0) return 0;
  return ((value % size) + size) % size;
}

/**
 * The seat that works on chain `chain` in round `round`, where round 0 is the seed. The chain
 * moves one seat along each round, so no player ever works on the same chain twice.
 */
export function holderSeat(chain: number, round: number, playerCount: number): number {
  return wrap(chain + round, playerCount);
}

/**
 * The chain `seat` works on in round `round`: the inverse of `holderSeat`. Games deal their
 * links with this one, because a game knows a seat and the round, and asks which chain it holds.
 */
export function chainHeldBy(seat: number, round: number, playerCount: number): number {
  return wrap(seat - round, playerCount);
}
