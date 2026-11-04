# Plan: Sketch Phone (the `chain` capability)

Status: **decided and being built.** The screens were designed before the game, as the second
goal asks: `design/TVSketchPhone*.dc.html`, `design/PhoneSketchPhone*.dc.html` and
`design/PhoneNoTvSketchPhone*.dc.html`, accepted in PR #160.
Inputs: issue #145 (the intent this plan implements), [intent/0001-platform-mvp.md](../intent/0001-platform-mvp.md)
(Phase 2 is drawing games), [ROADMAP.md](../ROADMAP.md) (the `chain` row and the Sketch Phone row),
[plan/0003-doodle-bluff.md](0003-doodle-bluff.md) for the stroke model and the broadcast budget,
[plan/0004-no-tv-mode.md](0004-no-tv-mode.md) for phone-only rooms.

The issue left four questions open. The accepted designs answer all four, and they are recorded
as decisions here rather than left to the implementation:

- **D1. Does Sketch Phone opt into no-TV?** Yes. The design set draws phone-only draw, vote,
  replay and favourite screens, and the replay is the payoff, so a room without a shared screen
  keeps it on one phone and everyone else watches. `noTv: true`.
- **D2. How long is a chain, and does every chain replay?** Every chain is one link per player,
  so a room of `n` plays `n` chains of `n` links. Every chain replays in full, one link at a
  time, then the room votes on that chain's links. The designs' "Chain 3 of 8" is the chain's
  position in the replay order, not a highlight.
- **D3. Is there scoring?** Yes. A link earns 100 points for every vote it gets ("Each vote is
  +100", `design/PhoneSketchPhoneVote.dc.html`), and the finale crowns the room's best link
  maker. There is no penalty and no bonus.
- **D4. Is this the right next game?** Not this plan's call; the roadmap already orders it here
  and the owner accepted its designs.

## The chain capability

`packages/sdk/src/chain.ts` holds the turn arithmetic, because it is the part of a chain game
that is easy to get subtly wrong and it is the same for every chain game:

- a chain has one link per player (`chainLength`);
- links alternate words, drawing, words, … from the seed (`stepKind`);
- in round `r`, seat `s` works on chain `(s - r) mod n` (`chainHeldBy`), so a chain moves one
  seat per round and no player ever works on the same chain twice.

The deal is `chainHeldBy` for every (seat, round) pair at setup, so the rules never repeat the
formula; `transferRounds` counts the rounds a chain is passed on.

It is pure arithmetic with no state, so it is unit-tested on its own and the game's rules are
thin on top of it.

## Screens and phases

| Phase | Who acts | Phone | TV |
| --- | --- | --- | --- |
| `write` | everyone | write a phrase (`PhoneSketchPhoneWrite`), or ask for one | who is done (`TVSketchPhoneWrite`) |
| `draw` | everyone | draw the phrase they were handed (`PhoneSketchPhoneDraw`) | who is done (`TVSketchPhoneRound`) |
| `describe` | everyone | describe the drawing they were handed (`PhoneSketchPhoneDescribe`) | who is done (`TVSketchPhoneRound`) |
| `replay` | the chain's owner | Next link, or wait (`PhoneSketchPhonePresent`, `…Sent`, `…TimesUp`) | the chain, one link at a time (`TVSketchPhoneReplay`) |
| `vote` | everyone but nobody's own link | pick a favourite link (`PhoneSketchPhoneVote`) | every link of the chain, and the vote count (`TVSketchPhoneVote`) |
| `favourite` | nobody | the winner and what you earned (`PhoneNoTvSketchPhoneFavourite`) | the winner and the points (`TVSketchPhoneFavourite`) |

Rounds: the room deals one round per player at setup, and the deal is what the rules count.
Round 1 is `write`, then `n - 1` transfer rounds, alternating `draw` and `describe`. Seven
players therefore see "Round 4 of 7" — the seed is round 1 — and "Link 4 of 7" in the replay,
where a link is one player's contribution to a chain. Both counts come from the deal rather than
the live roster: a kick in round three cannot skip a dealt round or cut the last links off a
chain the room already played.

A drawing or description is sent when the player taps done, or when the phase times out: the
room keeps whatever the player had (a half-drawn page is still a link; an empty one is dropped
from the replay). One player's link is never on the wire to anyone else until the replay.

## Timing

| Constant | Value | Why |
| --- | --- | --- |
| `WRITE_MS` | 40s | writing a phrase is quick; the design shows 0:38 left |
| `DRAW_MS` | 75s | one drawing, not Doodle Bluff's two; the design shows 1:04 left |
| `DESCRIBE_MS` | 35s | the design shows 0:31 left |
| `PRESENT_MS` | 4s | the fallback pace for a chain nobody taps through |
| `VOTE_MS` | 20s | a little under Doodle Bluff's vote: one chain, not a whole ballot |
| `FAVOURITE_MS` | 6s | one card, one beat |

The eight-player table stays inside the standard length. Seven transfer rounds are four drawings
and three descriptions, so the phases are 40 + 75 × 4 + 35 × 3 = 445 seconds. Each of the eight
chains then costs 8 × 4 + 20 + 6 = 58 seconds to replay and vote on, so 8 × 58 = 464.
Together ≈ 909 seconds: about 15 minutes, and `minutes.test.ts` holds the advertised 15 to it.

When only disconnected players have not acted, the phase deadline is pulled in to the left-player
grace, exactly like Doodle Bluff: a phone that blinks off keeps its half-made link and can still
finish it if it comes back in time.

## State and the wire

State is plain JSON. Every link stores its chain, step, kind, author, and its content: `text` for
a words link, a doodle for a drawing link. Nothing else is derived at send time.

- One view broadcast per change, as everywhere else.
- A `strokes` action is chunked by the phone (the shared pad's `pendingChunks`), and the rules
  accept a chunk only when its `from` is exactly the link's current stroke count, so a stale or
  replayed chunk is a no-op.
- The replay reveals links one at a time: the host view carries only the links revealed so far,
  so a player who missed three chains cannot read the fourth early.
- A drawing is data every phone already renders with the shared `paintDoodle`, so the phone-only
  mode costs no new payload.

## Content

`contentKind: "drawing-prompts"`. At setup each phone is dealt three of the room's own prompts
(`dealSuggestions`), and the write screen offers them as chips the player taps to start from.
The packs are the content, so a room's language decides the phrases and the game ships no words
of its own; the packs stay as they are. A suggestion is only a suggestion: the player edits or
keeps the words and sends them as their own.

## Registering the game

- `packages/sdk/src/index.ts` exports the chain capability.
- `games/sketch-phone/` (rules, views, bots, UI, previews, tests).
- `apps/worker/src/games.ts` for the room, `apps/web/src/games.tsx` for the stage and phone.
- `packages/i18n` for `en` and `he` copy and `game-copy.ts` for the picker's name.
- `apps/web/src/dev/screens.ts` and `design/canvas.json` (`screen` on every artboard).
- `scripts/content-stress.test.ts`'s fixture follows the longest shipped prompt.

## Edge cases

- **A kicked player.** Their unfinished link is dropped; links already made stay, and the chain
  replays with the links it has. Their votes go, and no view names them.
- **An empty link at the deadline.** A words link with no words, or a drawing with no strokes, is
  dropped from the chain. If a chain ends up with no links at all, it is skipped.
- **The chain's owner disconnects during its replay.** The links still advance on the timer; the
  Next button is a shortcut, not the clock.
- **Too few players.** Three is the floor at setup, as everywhere else.
