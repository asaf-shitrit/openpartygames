# Plan: Doodle Bluff (the `canvas` capability)

Author: Asaf Shitrit. **Status: decided and being built.** D1-D6 were settled on 2026-09-18 and the "Open decisions" section now records what was chosen. Numbers still marked as estimates stay estimates until slice 1 measures them.
Inputs: [intent/0001-platform-mvp.md](../intent/0001-platform-mvp.md) (Phase 2 is drawing games, `intent/0001-platform-mvp.md:100`), [ROADMAP.md](../ROADMAP.md) (the `canvas` row, `ROADMAP.md:26`, and the Doodle Bluff row, `ROADMAP.md:53`), [plan/0001-platform-mvp.md](0001-platform-mvp.md) and [plan/0002-game-feel.md](0002-game-feel.md) for house rules, [CONTRIBUTING.md](../CONTRIBUTING.md) for pack and licensing rules.

Every technical claim below cites the file and line it came from. Where an earlier section still reads as a proposal, the decisions section at the end is what was chosen.

This plan builds on the content-kind work in PR #5 (Most Likely To), which is not merged yet: `superlatives` is the worked example of adding a content kind to the per-kind tables, and `games/most-likely-to/` is the structure this game copies. This branch is based on that one, so those citations resolve.

It also builds on no-TV mode ([plan/0004-no-tv-mode.md](0004-no-tv-mode.md)), which lands first and which this game opts into — see "No-TV mode" below.

## Goal and scope

Doodle Bluff is the Drawful-shaped game the roadmap lists first in Phase 2 (`ROADMAP.md:49`, `ROADMAP.md:53`): players draw secret prompts on their phones, then each drawing is shown to the room, everyone except the artist writes a fake title, and the room votes for the real one. It is the game that forces the `canvas` capability into existence, which `intent/0001-platform-mvp.md:100` names as the point of Phase 2.

### What ships

- The `canvas` capability, as a **pure, testable stroke model** with replay timing, plus a phone drawing pad and a renderer shared by the pad, the phone view and the TV.
- A new content kind, `drawing-prompts`, carrying house titles for thin ballots, with two starter packs and table-driven validation in `scripts/pack-rules.mjs`.
- `games/doodle-bluff/`, following the `games/most-likely-to/` split: `state.ts` / `rules.ts` / `views.ts` / `awards.ts` / `index.ts`, with `src/ui/` holding Host, Phone, a pure beat timeline and previews.
- A **finale gallery** of every drawing made in the game, which then dies with the room.
- Registration everywhere a game has to be registered (listed under "Registering the game").
- Unit tests, 3- and 8-player bot playthroughs with a disconnect and rejoin, `@testing-library/react` component tests, and browser e2e.
- An **opt-in to the planned no-TV mode**, with the per-phase behaviour and the cost stated (see that section).

### What explicitly does not ship

- **Live drawing sync.** The TV does not mirror a stroke as it is drawn. That is Quick Sketch (`ROADMAP.md:55`), and the cost model below explains why it cannot be bolted on cheaply.
- **Chained rounds.** No pass-along. That is Sketch Phone and needs the `chain` capability (`ROADMAP.md:27`, `ROADMAP.md:54`).
- **Draw-your-own avatars**, which `intent/0001-platform-mvp.md:56` parks behind the Phase 2 canvas. The stroke model here is the prerequisite; the avatar picker change is a separate plan.
- **Any persistence, export or download of a drawing.** See "The gallery, and drawings dying with the room".
- **Erase, fill, shapes, redo, pressure or variable line width.** One pen, six colours, undo, clear.

## Decisions already made with the maintainer

Treat every row as settled. The plan is built around them.

| Topic | Decision |
|---|---|
| Ink | **A palette of about six marker colours**, not a single ink. Colour is decoration only: no rule, score, title or vote ever references a stroke's colour |
| Drawings per player | **Two prompts each, all drawn in one phase up front.** Then drawings are shown one at a time: everyone except the artist titles, then the room votes, exactly as Real or Nah handles lies and voting |
| Replay | **The drawing replays stroke by stroke** over a couple of seconds when it is shown, matching the staged reveals in `plan/0002-game-feel.md`. Stroke order and enough timing to replay must survive in the stored drawing |
| Finale | **A gallery of every drawing at the finale**, then the drawings die with the room. Nothing stored server-side beyond the room, no accounts, no export |
| Thin ballots | **Topped up with house titles from the content pack**, the same mechanism Real or Nah uses for decoys. The pack item carries house titles alongside the prompt. Playable at 3 players; the option minimum does not rise |
| Artist scoring | **The artist is paid per player who found the real title.** A clear drawing wins; nothing rewards a deliberately obscure drawing |
| No-TV mode | A phones-only mode is planned and lands **before** this game is built. This plan does not design it, only states how Doodle Bluff behaves there |
| No-TV audio | Phones are silent in no-TV mode (haptics only), so every reveal beat leaning on a sound cue needs a visual equivalent |
| No-TV joining | Joining a no-TV room is by **reading the code aloud**. This plan assumes no invite link and no QR code exists there |

## Game rules

### Shape, and how it reuses Real or Nah

The write → vote → reveal spine is Real or Nah's, almost unchanged (`plan/0001-platform-mvp.md:109`–`plan/0001-platform-mvp.md:131`). Reused wholesale:

- The text rules for a submitted title: clean, length-check, reject if it normalizes equal to the truth (`games/real-or-nah/src/index.ts:102`), reject if it duplicates another player's accepted entry (`games/real-or-nah/src/index.ts:422`), one error per player surfaced on their own phone (`games/real-or-nah/src/index.ts:436`).
- Ballot building: the truth, plus every accepted fake, topped up with house entries until there are at least `MIN_OPTIONS = 4`, skipping any that collides with an existing option (`games/real-or-nah/src/types.ts:12`, `games/real-or-nah/src/index.ts:164`–`:180`).
- "You cannot pick your own", and a player with nothing pickable does not block the phase (`games/real-or-nah/src/index.ts:382`–`:398`).
- Reveal shape and anonymization of a departed player's entry (`games/real-or-nah/src/index.ts:219`–`:237`).

Where it differs:

1. There is **one drawing phase up front**, and the prompt is secret to one player instead of public to everyone.
2. Each shown drawing has an **artist**, who does not title it and does not vote on it — they already know the answer.
3. The artist scores, which Real or Nah has no equivalent of.
4. The thing being titled is ~2.7 KB of stroke data rather than a one-line prompt string, which is the entire engineering problem.

### Structure

3–8 players, matching the platform (`packages/protocol/src/index.ts:32`–`:33`), at the platform's fixed ~15 minute length (`intent/0001-platform-mvp.md:134`).

1. **`draw`** — one phase. Every player receives **two** secret prompts and draws both. Ends early when every connected player has marked both done.
2. **`title` / `vote` / `reveal`** — repeated once per *shown* drawing.
3. **`gallery`** — every drawing made in the game, the shown ones and the unshown ones, on the TV.

### How many drawings get shown, with the arithmetic

Eight players draw 16 drawings. At 77 s per shown drawing that is 20 minutes of titling alone, well past the platform's ~15 minutes. Three levers were considered:

- **Fewer drawings per player in a big room** — ruled out, since two each is settled.
- **A shorter per-round clock** — used, but only so far. 35 s is already brisk for writing a funny title while reading a picture, and the vote has to be long enough to read up to eight options.
- **A cap on how many drawings get titled** — the lever that actually scales, and the one recommended.

Proposed constants:

```
DRAW_MS     = 130000     // both prompts, one phase
TITLE_MS    =  35000
VOTE_MS     =  30000
REVEAL_MS   =  12000     // fixed, one storyboard, like MLT (games/most-likely-to/src/state.ts:10)
GALLERY_MS  =  20000
TITLED_MAX  =     10
shownCount(n) = min(2 * n, TITLED_MAX)
```

One shown drawing costs `35 + 30 + 12 = 77 s`.

| Players | Drawn | Shown | Draw | Titling rounds | Gallery | Game |
|---|---|---|---|---|---|---|
| 3 | 6 | 6 | 130 s | 6 × 77 = 462 s | 20 s | **~10.2 min** |
| 4 | 8 | 8 | 130 s | 8 × 77 = 616 s | 20 s | **~12.8 min** |
| 5 | 10 | 10 | 130 s | 10 × 77 = 770 s | 20 s | **~15.3 min** |
| 6 | 12 | 10 | 130 s | 770 s | 20 s | **~15.3 min** |
| 7 | 14 | 10 | 130 s | 770 s | 20 s | **~15.3 min** |
| 8 | 16 | 10 | 130 s | 770 s | 20 s | **~15.3 min** |

Five through eight players land flat at ~15.3 minutes, which is the target. Three and four players run short — 10 and 13 minutes — because there simply are not enough drawings. That is honest rather than ideal, and it matches Most Likely To already declaring `minutes: 12`. `minutes: 15` in the `GameDefinition`, which is what the picker shows (`packages/sdk/src/types.ts:129`).

**Which drawings get shown, at 6–8 players.** Round-robin over `ctx.rng.shuffle(playerIds)`: pass one takes each player's first drawing, pass two takes each player's second, stopping at `TITLED_MAX`. So **every player's work is shown at least once** before anyone's is shown twice, and which players get a second showing is deterministic from the seed. At 8 players, 8 drawings are shown in pass one and 2 in pass two.

**The second drawing is not wasted**, for three reasons worth saying out loud on the phone ("Draw two — we'll show as many as we have time for"):
1. It is the **spare** when the first one never arrives (see Edge cases), which is what makes that edge case cheap to handle.
2. Every drawing appears in the **gallery**, shown or not.
3. Drawing two in one uninterrupted phase is a better experience than two short phases — nobody is sitting idle waiting for the slowest artist twice.

### Scoring

Numbers chosen to sit alongside Real or Nah's so the two games' scores stay comparable (`games/real-or-nah/src/types.ts:18`–`:19`):

| Who | When | Points | Real or Nah equivalent |
|---|---|---|---|
| A voter | Picked the real title | **+1000** | `POINTS_TRUTH = 1000`, identical |
| A fake title's author | Per player their title fooled | **+500 each** | `POINTS_PER_FOOL = 500`, identical |
| **The artist** | Per player who found the real title | **+500 each** | no equivalent |
| The artist | **Nobody found it** | **0** | — |
| A house title | Ever | **0, to nobody** | house decoys have no author |

**The artist gets nothing when nobody finds it.** Not a penalty — no points are taken away — but no reward either, which is the whole point: a drawing so obscure that the room is lost pays its artist exactly as much as not drawing at all. The `abstract-artist` award (below) keeps that landing as a joke rather than a punishment.

This produces a clean symmetry worth preserving: **every vote pays exactly 500 to someone** — to the artist if the voter found the truth, to a forger if they were fooled, to nobody if they picked a house title — and a voter who found the truth also earns 1000 for themselves. Nothing else was added on top. An earlier draft proposed a bonus for a drawing everyone found; it is dropped, because at 8 players a perfectly clear drawing already pays its artist 7 × 500 = 3500, the largest single payout in the game, and a bonus would break the symmetry.

### TV versus phones

Following `intent/0001-platform-mvp.md:63` — phones mirror the essentials, reveals live on the TV.

| Phase | TV | Phones |
|---|---|---|
| `draw` | "Everyone is drawing", a timer, and who has finished both. **No drawings.** | The pad, the player's own two secret prompts, the palette, undo, clear, done |
| `title` | The drawing, replaying stroke by stroke over ~2.2 s then held finished, plus who has written | The drawing (finished immediately), the title box; the artist sees "Your drawing — sit tight" |
| `vote` | The drawing and the ballot, plus who has voted | The drawing and tappable options; the artist is a spectator |
| `reveal` | The full storyboard: fakes, who they fooled, the truth, the artist, standings | Personal result card, held back behind the TV beat (`plan/0002-game-feel.md:44`) |
| `gallery` | Every drawing in a grid, each with its artist and the title that won, inking in as a staggered cascade | "Look up" |

### Awards

Four, following the `games/most-likely-to/src/awards.ts` pattern — deterministic, derived from `state.history`, with `MAX_AWARDS = 3` published (`packages/protocol/src/index.ts:89`):

- `pen-of-the-people` — the most people found your drawings' real titles.
- `master-forger` — fooled the most people with fake titles.
- `sharp-eye` — found the most real titles.
- `abstract-artist` — drew the one nobody guessed. Warm copy, not a punishment.

## The `canvas` capability

Three constraints that are not negotiable:

1. **Game logic stays pure and deterministic, and state is plain JSON.** `packages/sdk/src/types.ts:1`–`:3` states it; `CONTRIBUTING.md:25` repeats it; `packages/sdk/src/types.ts:123`–`:153` is the contract. So a stroke is numbers — never an `ImageData`, never a `Path2D`, never a data URL produced by a canvas.
2. **`.tsx` tests run in happy-dom, which has no 2D canvas context.** `packages/ui/vitest.config.ts` and `apps/web/vitest.config.ts` set `environment: "happy-dom"`; game packages run node and opt in per file (`games/most-likely-to/vitest.config.ts:3`). happy-dom's `HTMLCanvasElement.getContext()` returns `null` unless a `canvasAdapter` is configured — `node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-canvas-element/HTMLCanvasElement.js:139`–`:141`. Worse for a drawing pad, `Element.getBoundingClientRect()` returns an all-zero `DOMRect` — `.../lib/nodes/element/Element.js:795`–`:798`. The project already lives with the first half: `Confetti` takes a `createPainter` seam so tests inject a recording painter (`packages/ui/src/fx/Confetti.tsx:35`–`:36`, `:63`–`:69`), and `plan/0002-game-feel.md:53` records the constraint. **So every piece of geometry and every piece of replay timing — pointer-to-grid mapping, simplification, bounds, the replay schedule, hit-testing — is a pure function over plain numbers, and the only code not covered by a unit test is the thin `ctx.lineTo` shell.**
3. **CRAP ≤ 8 per function**, so these are small named helpers, not one big `handlePointer`.

### Stroke data model and encoding

```ts
/** Palette index into DOODLE_INKS. Decoration only: no rule reads it. */
type InkIndex = number;

interface Stroke {
  /** Palette index. */
  c: InkIndex;
  /** How long the stroke took, in TICK_MS units, capped at STROKE_MS_CAP. */
  d: number;
  /** Pause before this stroke started, in TICK_MS units, capped at GAP_MS_CAP. */
  g: number;
  /** [x0, y0, dx1, dy1, ...] — first point absolute, later points deltas. Integers on a GRID square. */
  p: number[];
}

interface Doodle { v: 1; s: Stroke[] }
```

- `GRID = 1024`. Aspect-independent; the pad and the TV each map the square onto their own box. At the TV's drawing size (~900 px on a 1920×1080 stage) one grid unit is ~0.9 px, so quantization is invisible.
- **Delta encoding**, because consecutive points are close: after simplification a typical step is under 60 units, two or three characters instead of four.
- **Timing is per stroke, not per point.** `d` is the stroke's own duration and `g` is the pause before it, both quantized to `TICK_MS = 20` and capped (`STROKE_MS_CAP = 3000`, `GAP_MS_CAP = 1000`). Per-point timestamps would roughly triple the size for detail nobody can see at 2 s of replay; per-stroke timing is what preserves the thing that actually reads — the artist's rhythm, the hesitation before the punchline detail. Caps keep a 40-second stare from swallowing the whole replay budget.
- **Order is inherent.** `s` is in draw order, so the replay needs no extra index.
- **Simplification happens on the phone before anything is sent**: drop a sample within `MIN_STEP = 6` grid units of the last kept point, then Ramer–Douglas–Peucker with `RDP_EPSILON = 4`. Both pure, unit-tested in node. This is where most of the size saving comes from — raw pointer sampling at 120 Hz produces roughly four times the points a doodle needs. Simplification changes point *count*, never stroke `d`, so it never distorts the rhythm.
- `v: 1` so an old snapshot still renders after an encoding change, matching the project's habit of optional-and-normalized snapshot fields (`plan/0002-game-feel.md:49`).

Caps, enforced by the game's zod `actionSchema` and by the rules:

```
MAX_STROKES_PER_DOODLE = 64
MAX_POINTS_PER_STROKE  = 128
MAX_POINTS_PER_DOODLE  = 1200
MAX_POINTS_PER_CHUNK   = 400      // rules-level sanity bound; the frame cap is the hard bound
```

Coordinates parse as `z.int().min(0).max(GRID - 1)` for a stroke's first point and `z.int().min(-(GRID - 1)).max(GRID - 1)` for deltas, at the boundary, per `CONTRIBUTING.md:24`.

### Size budget, with the arithmetic

Per-point JSON cost is two numbers and two commas: **6 bytes** typical (`"12,-7,"`), **12 bytes** worst case (`"-1023,-1023,"`).

Per-stroke framing with colour and timing, `{"c":0,"d":150,"g":50,"p":[]},` = **30 bytes** at full digit width (it was 15 bytes with colour alone, 3 bytes for a bare array).

| | Strokes | Points | Points cost | Framing | Total |
|---|---|---|---|---|---|
| **Typical drawing** | 15 | 375 | 375 × 6 = 2,250 B | 15 × 30 = 450 B | **~2.7 KB** |
| **At the caps** | 64 | 1,200 | 1,200 × 12 = 14,400 B | 64 × 30 = 1,920 B | **~16.3 KB** |

What the two settled features cost against a bare stroke array:

| Feature | Per stroke | Typical drawing | At the caps |
|---|---|---|---|
| Colour (`c`) | +12 B | +180 B (+8%) | +770 B (+5%) |
| Replay timing (`d`, `g`) | +15 B | +225 B (+9%) | +960 B (+6%) |
| **Both** | **+27 B** | **+405 B (+18%)** | **+1.7 KB (+12%)** |

**Neither moves the budget.** A palette is a screen-space decision, not a bandwidth one; replay timing is an 18% tax on a payload measured in kilobytes. A flat `[c, d, g, x0, y0, ...]` array would cut the framing to 8 bytes and claw most of it back, but named fields read better in a contributor codebase and the budget does not need the saving.

### The replay, and what a device joining mid-reveal sees

```ts
/** Pure. Stroke start/end times scaled so the whole replay fits `replayMs`. */
function replaySchedule(doodle: Doodle, replayMs: number): StrokeWindow[];

/** Pure. Which strokes are complete and how far the in-progress one has got. */
function replayStateAt(schedule: StrokeWindow[], elapsedMs: number): ReplayState;
```

- Stored timings are a *relative shape*, not a wall clock — the artist had 130 s for two drawings and the replay is `REPLAY_MS = 2200`. `replaySchedule` sums `d + g` across the strokes (gaps already capped at 1000 ms so one long pause cannot swallow the budget) and scales the total to `REPLAY_MS`, preserving the ratios. A drawing with 3 strokes and one with 60 both take 2.2 s; the *rhythm* inside them differs.
- The in-progress stroke draws its points up to the elapsed fraction, so nothing pops.
- **Both functions are pure over plain numbers**, unit-tested in node with no DOM. Table tests cover: an empty drawing, one stroke, all-gap-no-draw, and a drawing whose raw total is 200× `REPLAY_MS`.

**Mid-reveal join.** The replay is anchored on `timerStartedAt` (`packages/protocol/src/index.ts:109`–`:110`, set at `packages/sdk/src/room.ts:344`–`:351`), which the platform already corrects for clock skew (`packages/ui/src/index.ts:149`–`:154`). A TV or phone that mounts at `elapsedMs >= REPLAY_MS` gets `replayStateAt` returning the **finished drawing, immediately, with no animation and no cues fired** — exactly the rule `plan/0002-game-feel.md:43` already sets for every moment, and the same behaviour `prefers-reduced-motion` produces (`packages/ui/src/index.ts:38`). This is asserted directly: a component test mounts at 4000 ms into a 2200 ms replay and asserts a complete drawing and zero cue calls.

**Where it replays.** Once, at the start of `title`, then held finished for `vote` and `reveal` — replaying it again during the reveal would spend the storyboard's seconds on something the room already watched, and the reveal's drama is the titles. The gallery replays each drawing briefly as a staggered cascade, using the same schedule with a shorter `replayMs`.

### Durable Object snapshot arithmetic

The chain to verify: a change sets `out.changed` (`packages/sdk/src/room.ts:1008`), the hub persists the whole snapshot when `result.changed` (`apps/worker/src/room-hub.ts:257`), the snapshot is one JSON string containing *everything*, the running game's state included (`packages/sdk/src/room.ts:613`–`:633`), and the adapter writes it to one Durable Object storage key (`apps/worker/src/room.ts:146`, key `"room"` at `apps/worker/src/room-hub.ts:24`).

The `Room` class is SQLite-backed — `apps/worker/wrangler.jsonc:20` declares `"new_sqlite_classes": ["Room"]`. Per [Cloudflare's Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/), for SQLite-backed objects:

- **Key size / Value size: "Key and value combined cannot exceed 2 MB".** This is the binding limit for the snapshot.
- Storage per Durable Object: 10 GB (irrelevant — one key).
- WebSocket message size: 32 MiB, received only (also irrelevant — the self-imposed 4096-byte frame cap below is far tighter).

**The gallery forces every drawing to survive to the end of the game.** All `2n` drawings stay in game state from the draw phase until `isOver`, including the ones never shown. At 8 players that is 16 drawings:

| Case | Drawings | Each | In the snapshot | Share of 2 MB |
|---|---|---|---|---|
| 8 players, typical drawings | 16 | 2.7 KB | **43 KB** | 2.1% |
| 8 players, every drawing at the caps | 16 | 16.3 KB | **261 KB** | 12.7% |
| 5 players (the worst shown-count case), typical | 10 | 2.7 KB | 27 KB | 1.3% |

Room overhead today — players, tokens, pack catalog, scores, per-round history — is a few KB.

**Conclusion: keeping every drawing to the end of the game for the gallery costs at most ~13% of the snapshot limit, in a case where all 16 artists max out every cap.** Storage is not the constraint. Broadcast bandwidth is.

### Getting a drawing to the server, given the message cap

The cap is `MAX_MESSAGE_LENGTH = 4096` at `packages/protocol/src/index.ts:215`, enforced in `parseClientMessage` at `packages/protocol/src/index.ts:227` — an oversized frame returns `null` and the socket gets `bad-message` (`apps/worker/src/room-hub.ts:180`–`:184`). The same line rejects every `ArrayBuffer` frame, so a binary upload path does not exist today. The action payload is `z.json()` (`packages/protocol/src/index.ts:160`), parsed by the game's own schema inside the room (`packages/sdk/src/room.ts:994`).

A 2.7 KB drawing fits in one frame; a 16 KB one does not.

**Recommended: chunked submit. No protocol change.** (Decision D1.)

```ts
| { type: "strokes"; drawingId: string; from: number; strokes: Stroke[] }
| { type: "doodle-done"; drawingId: string }
```

- `from` is the index of the first stroke in the chunk. The rules accept a chunk **only when `from === currentStrokes.length`**. A chunk with a lower `from` is a duplicate and returns the same state object, which `packages/sdk/src/room.ts:1005` treats as a no-op: no snapshot write, no broadcast. That is the idempotency the reconnect path needs, for free.
- The **phone packs chunks by measured serialized size**, filling to ~3.4 KB of frame, so it never builds a frame the cap would reject. A typical drawing is therefore **one chunk**; a dense one is three or four. `MAX_POINTS_PER_CHUNK = 400` is a rules-level sanity bound behind that.
- No server-side rate limit on chunks. A flood of duplicates is already a no-op, and once `MAX_POINTS_PER_DOODLE` is reached every further chunk is a no-op too. A server-side throttle like the imposter's `TYPING_MIN_INTERVAL_MS` (`games/imposter/src/state.ts:26`, applied at `games/imposter/src/index.ts:401`–`:424`) would be wrong here: a rejected chunk loses ink, and a bot that keeps retrying a throttled action burns the playthrough step budget, since `BotPlaythrough` only advances its fake clock when *nobody* acts (`packages/sdk/src/testing.ts:293`–`:308`). Throttle on the client instead, as the imposter's typing path does (`plan/0002-game-feel.md:186`).

**The alternative, rejected: raise `MAX_MESSAGE_LENGTH` for one action.** It cannot be raised for one action — it is a single length check on the raw frame before any parsing (`packages/protocol/src/index.ts:227`), so raising it to 16384 raises the parse-cost ceiling for *every* message from every socket, weakening a cheap denial-of-service guard across the whole protocol. It is also a protocol contract change (`CLAUDE.md`: "Contract; change only deliberately"), and it still would not cover a drawing at the caps, so chunking would have to exist anyway. The upside it buys — one accepted action per drawing — is already what chunking delivers in the typical case.

### Getting a drawing to the TV and phones

The rule from `plan/0001-platform-mvp.md:20` is full views, no diffs: after every change each socket gets its own complete view. The hub broadcasts on a real change (`apps/worker/src/room-hub.ts:265`–`:272`, `:274`–`:281`) and builds each socket's own view (`apps/worker/src/room-hub.ts:284`–`:300`). A room has at most 9 sockets (8 players, `packages/protocol/src/index.ts:33`, plus the host).

**The design rule that follows: outside the gallery, a view carries at most one drawing — the one currently being titled, voted on or revealed.** All 16 live in state; only one goes on the wire at a time.

| | Per broadcast (9 sockets) | Broadcasts | Subtotal |
|---|---|---|---|
| `draw` phase (no drawings in any view) | 2 KB × 9 = **18 KB** | ~16 (one or two chunks per player) | ~290 KB |
| One shown drawing, typical | (2 + 2.7) × 9 = **42 KB** | ~18 per round (title entry + 8 titles + vote entry + 7 picks + reveal) | ~760 KB per round |
| Ten rounds, typical | | | **~7.6 MB per game across all sockets** (~845 KB per device) |
| One shown drawing, at the caps | (2 + 16.3) × 9 = **165 KB** | ~18 | ~3 MB per round, ~30 MB per game |
| **If a view carried all 16 instead** | ~10× | ~18 | **~76 MB — not acceptable** |

The ~2 KB room-view figure is an estimate and is a slice 1 measurement item, not a verified number.

**The gallery is the one place all drawings are on the wire at once, and it is affordable precisely because it happens once.** The gallery is a TV moment, so the **host view carries all 16 and the player views carry none** ("look up"). One broadcast of 16 × 2.7 KB + 2 KB = **~45 KB to a single socket**, or ~263 KB at the caps. In no-TV mode the same payload goes to 8 phone sockets instead: ~360 KB typical, ~2.1 MB at the caps, still once.

This is also why **live stroke mirroring is out of scope**. Mirroring means one accepted change per stroke — roughly 15 per player per drawing, 240 per draw phase at 8 players drawing two each — each a full snapshot write plus a full broadcast to 9 sockets. `intent/0001-platform-mvp.md:128` requires WebSocket volume per round to stay bounded, and `plan/0001-platform-mvp.md:299` names it a billing risk. Quick Sketch needs a different transport, not this one.

**A future optimization, deliberately not in v1:** the repeated cost is re-sending an unchanged drawing 18 times per round. A keyed side-channel — views carry `drawingId`, and a drawing is pushed once per socket and cached client-side — would cut titling and voting to near zero drawing bytes, and would make the gallery free. It breaks "full views, no diffs", so it needs its own decision and its own reconnect story. Revisit only if slice 1's measurements demand it.

### The phone drawing pad

A `<canvas>` sized to its CSS box, backing store at `min(devicePixelRatio, 2)` — the cap `Confetti` already uses (`packages/ui/src/fx/Confetti.tsx:48`–`:50`).

**Pointer handling.**
- `pointerdown` → `setPointerCapture(e.pointerId)`, start a stroke with the selected ink and record the gap since the previous stroke ended. `pointermove` → append. `pointerup` / `pointercancel` → close the stroke, record `d`, simplify, push on the undo stack.
- `touch-action: none` on the canvas, so a drag draws instead of scrolling or pinch-zooming the page.
- `getCoalescedEvents()` when present, for smoother sampling between frames. Feature-detect with `"getCoalescedEvents" in event` — the anti-slop rules ban `typeof` checks (`CLAUDE.md`, and `plan/0002-game-feel.md:53` uses the same `in` form for `navigator.vibrate`).
- Only the first active pointer draws; a second finger is ignored, so a palm resting on a phone does not paint.
- Timing comes from an injected clock, not `Date.now()` — the pad takes the same `ServerClock` every other timed component does (`packages/ui/src/index.ts:159`), so tests drive `d` and `g` deterministically.

**Geometry and timing are pure.** `gridPointOf(clientX, clientY, rect)` takes the rect as a plain `{ left, top, width, height }`, because happy-dom hands components an all-zero rect (`.../lib/nodes/element/Element.js:795`–`:798`). Component tests inject a synthetic rect; the mapping itself is unit-tested in node with no DOM. Same for `simplifyStroke`, `deltaEncode`, `deltaDecode`, `doodleBounds`, `replaySchedule` and `replayStateAt`.

**Rendering is one shared shell.** `paintDoodle(ctx, doodle, inks, box, upTo?)` takes a narrow structural context — the exact pattern `confetti-paint.ts` uses so a plain recording object satisfies it without a cast (`packages/ui/src/fx/confetti-paint.ts:9`–`:27`). The pad, the phone's read-only view, the TV and the gallery all call it. Tests assert the recorded call sequence.

**Colour palette.** Six marker inks. `AVATAR_FILLS` (`packages/ui/src/avatar-art.tsx:6`–`:19`) are pastel *fills* for avatar shapes — `#FFE45C` and `#FFF1B8` would be nearly invisible as a line on `#FBF8F1` paper (`packages/ui/src/styles.css:11`) — so the palette needs its own ink-weight constant. `DOODLE_INKS`, settled by the design pass and contrast-checked against the paper:

| Index | Name | Hex | Contrast on `#FBF8F1` | Source |
|---|---|---|---|---|
| 0 | Ink | `#2B2B2B` | — | `--opg-ink`, `packages/ui/src/styles.css:8` |
| 1 | Red | `#D7372B` | — | `--opg-marker`, `packages/ui/src/styles.css:13` |
| 2 | Blue | `#2F6FB5` | ~7.0:1 | design pass |
| 3 | Green | `#1E8449` | ~4.5:1 | design pass, **changed** from the draft's `#2E8B57` |
| 4 | Orange | `#C96A15` | ~3.8:1 | design pass, **changed** from the draft's `#E07A1F` |
| 5 | Purple | `#7A4FBF` | ~5.4:1 | design pass |

Two of the draft's four proposals did not survive measurement. A stroke is a non-text graphical object, so the floor is 3:1: the draft's sea green `#2E8B57` came in at ~4.1:1 (passing, but thin for a line on cream) and was darkened, and the draft's orange `#E07A1F` measured **~2.95:1 — below the floor**, which would have shipped a pen that disappeared on the paper for anyone with low vision. Both were darkened until they cleared it while still reading as marker pens. This is the reason the design pass owns the values rather than the plan (D7).

The palette control is a row of six swatches under the canvas, each a ≥44 px tap target (`design/AVATARS.md:24`). The selected swatch is marked by **a thicker ink ring plus a check glyph**, never by colour alone (`CLAUDE.md`, `intent/0001-platform-mvp.md:84`), and each has an accessible name ("Red pen"). Selection persists across strokes and across an undo. Because colour is decoration, a player who cannot distinguish the swatches loses nothing: no prompt, title, vote, score or award ever refers to a colour.

**Undo and clear.** Undo pops the last stroke and repaints from the model — no pixel-level undo buffer, so it is exact and costs nothing. Clear empties the stroke list behind a confirm, since it is destructive and the phase is timed. Both ≥44 px.

**Two prompts in one phase.** The pad shows prompt 1, and a "Next drawing" control switches to prompt 2 with its own canvas and its own undo stack. A progress marker ("Drawing 1 of 2") and the shared phase timer sit in the header. Switching back and forth is free — both models live in phone state. A player who only finishes one still has a valid drawing; see Edge cases.

**Rotate, resize, reconnect.**
- The model is grid coordinates, independent of pixels, so a rotation or a keyboard opening is a `ResizeObserver` repaint from the model. Nothing is lost. This is the main reason not to keep pixels.
- A **socket drop** loses nothing: strokes live in phone state until submit, and on reconnect the phone re-sends from `myStrokeCounts[drawingId]` in its view, which the `from` check makes idempotent.
- A **page reload** would lose them, so the pad mirrors each stroke list to `sessionStorage` on stroke end, keyed `opg:doodle:<CODE>:<drawingId>` — at most ~33 KB for two drawings, and `sessionStorage` dies with the tab, so nothing outlives the party. Every access wrapped, because a private window can throw.

**Reduced motion.** The pad has no motion to suppress. The motion-sensitive piece is the replay, which `useReducedMotion()` (`packages/ui/src/index.ts:38`) turns into an immediately finished drawing — the same end state as a mid-replay join.

**Screen readers, and players who cannot draw.** The canvas gets `role="img"` and an `aria-label` stating the prompt and progress ("Your drawing for 'a cat riding a skateboard': 12 strokes"), updated on stroke end. Next to it, a visible "Can't draw? Send a squiggle" button submits a small deterministic drawing, so no player is ever stuck staring at an empty canvas, and the browser e2e suite gets a fast deterministic path.

### Rendering on the TV

At 1920×1080 the drawing gets roughly a 900×900 box inside the doodle-notebook card, so one grid unit is ~0.9 px. `paintDoodle` scales the grid square to the card box. Line width scales with the box, minimum 4 px on the TV to match the kit's 4 px ink borders (`design/AVATARS.md`).

The gallery lays out up to 16 drawings in a grid at ~360×360 each, inking in as a staggered cascade off one shared schedule, with each artist's avatar and the title that won beside it.

### What a bot draws

`bot(view, rng)` is pure and has no DOM (`packages/sdk/src/types.ts:150`), so:

- `botDoodle(rng, drawingId)` returns a deterministic little scribble — 3 strokes of 8 points each, well under every cap, with `c` from the palette and plausible `d` / `g` values, all from `rng`, so the colour and replay-timing paths are exercised.
- The bot submits it **through the real chunk action**, one chunk per `bot()` call, using `myStrokeCounts` from its own view to know what the server already has. So the chunk path, the `from` check and `doodle-done` are all covered by `runBotPlaythrough` (`packages/sdk/src/testing.ts:343`) — for **both** of its drawings.
- Titles: `"bot title <id> <n>"`, mirroring Real or Nah's `"bot lie <id> <factNumber>"` (`plan/0001-platform-mvp.md:131`) so titles never collide as duplicates.
- Vote: a random option that is not the bot's own.
- **The bot must make progress on every call or return `null`** — never a repeatable no-op — because the harness only advances the fake clock when no bot acted (`packages/sdk/src/testing.ts:293`–`:308`), and `plan/0002-game-feel.md:57` records this exact trap.

3-player and 8-player playthroughs with `disconnectRejoin` (`packages/sdk/src/testing.ts:225`–`:246`) then cover: a bot dropping mid-draw with one finished drawing and a partial second one on the server and rejoining to finish it, and a bot dropping mid-title.

## Content: the `drawing-prompts` pack kind

New kind `drawing-prompts`, folder `packs/doodle-bluff/`. Added to the per-kind tables, each of which turns a missing entry into a typecheck failure:

- `packages/sdk/src/types.ts:77` (`GameContent` union) plus a `DrawingPrompt` / `DrawingPromptContent` pair next to `Superlative` (`packages/sdk/src/types.ts:52`–`:71`).
- `packages/sdk/src/content.ts:7`–`:20` (`CONTENT_MERGERS`).
- `apps/worker/src/content.ts:82`–`:89` (`CONTENT_FROM_ROWS`) and a `drawingPromptFromRow` beside `superlativeFromRow` (`apps/worker/src/content.ts:107`–`:111`).
- `scripts/pack-rules.mjs:9`–`:13` (`KIND_BY_FOLDER`) and `:123`–`:127` (`ITEM_ERRORS_BY_KIND`).

No D1 migration: `packs` and `pack_items` are generic and store the item as JSON (`plan/0001-platform-mvp.md:195`–`:196`).

### Item shape

```json
{
  "id": "cat-riding-a-skateboard",
  "prompt": "a cat riding a skateboard",
  "houseTitles": [
    "a dog on a scooter",
    "a squirrel driving a bus",
    "a hamster in a shopping trolley",
    "a duck on a unicycle"
  ]
}
```

`houseTitles` is the drawing-prompt equivalent of `Fact.decoys` (`packages/sdk/src/types.ts:48`), consumed by the same top-up mechanism.

### How many options a ballot needs, and why four house titles

`MIN_OPTIONS = 4` stays where it is (`games/real-or-nah/src/types.ts:12`) — the minimum does not rise.

At 3 players, one is the artist and two can title, so the ballot is the truth plus at most 2 player titles. The worst cases:

| At 3 players | Player titles | Options before top-up | House titles needed |
|---|---|---|---|
| Both titlers submitted | 2 | 3 | 1 |
| One submitted | 1 | 2 | 2 |
| Neither submitted | 0 | 1 | 3 |
| Neither submitted, and the ballot needs a spare because a house title collided | 0 | 1 | 4 |

So **a prompt carries at least 4 house titles**, validated at pack time. That is one more than the theoretical worst case, so a single collision between a house title and a player's title still leaves a usable ballot. Real or Nah requires only 2 decoys (`scripts/pack-rules.mjs:272`) because a 3-player Real or Nah has 3 lies plus the truth already.

A ballot never exceeds 8 options: 7 player titles plus the truth at 8 players, with no top-up needed above 4 players.

### How house titles are chosen, deterministically

`ctx.rng.shuffle(item.houseTitles)`, then taken in order, skipping any whose normalized form already appears among the options — the same loop Real or Nah uses (`games/real-or-nah/src/index.ts:164`–`:180`), with one improvement: Real or Nah walks `fact.decoys` in pack order (`games/real-or-nah/src/index.ts:167`), so the same decoys always surface first. Shuffling first is still deterministic for a given seed — `Rng.shuffle` returns a new array and does not mutate (`packages/sdk/src/types.ts:26`) — but varies across games, so a room playing the same pack twice does not see the same house titles twice.

The whole ballot is then shuffled and given ids `o1…`, as Real or Nah does (`games/real-or-nah/src/index.ts:182`–`:190`), so a house title is not positionally identifiable.

### What stops a house title colliding

Three layers:

1. **Against the real title, at pack time.** No house title may normalize equal to the prompt, and no two house titles may normalize equal to each other. Same rule shape as `decoyErrors` (`scripts/pack-rules.mjs:268`–`:289`), using the shared `normalizeAnswer` (`scripts/pack-rules.mjs:44`). A collision here would put two "correct" answers on the ballot, so it is a CI failure, not a runtime fallback.
2. **Against a player's title, at runtime.** The top-up loop keeps a set of normalized options and skips a house title already present (`games/real-or-nah/src/index.ts:166`–`:178`). The player's title wins, because it was accepted first and its author is owed the fooling points.
3. **Against the real title, at runtime.** A player who types the real title is already rejected with `titleError: "truth"` before the ballot is built (`games/real-or-nah/src/index.ts:102`, `:444`), so the truth appears exactly once.

House titles have `authorId: null` and pay nobody, so a house title that fools somebody costs that voter their 1000 and pays no one — exactly Real or Nah's treatment of a decoy.

### Validation rules

Reusing the shared helpers already in `scripts/pack-rules.mjs`:

- `id` — non-empty, unique in the pack (`itemIdErrors`, `scripts/pack-rules.mjs:239`).
- `prompt` — trimmed, non-empty, at most `MAX_DRAWING_PROMPT_LENGTH = 60` characters counted as code points, starting lowercase, no trailing `?` `.` `!`, no `____`, unique in the pack. Every one of these exists as a helper for superlatives (`scripts/pack-rules.mjs:330`–`:342`) and should be shared rather than copied.
- `houseTitles` — **at least 4**, each a string within the same length limit, none normalizing equal to the prompt or to another house title.
- **No `source` requirement.** `sourceErrors` (`scripts/pack-rules.mjs:299`) applies to facts, because `CONTRIBUTING.md:81` requires a source URL for facts specifically. Drawing prompts are original writing, like the superlative packs.
- **Drawable, and readable-free.** A prompt must be something a person can draw without writing words. Reviewer rule, not a machine rule, plus a lint on a few giveaways (`the word`, `spell`, `written`).

### Starter packs

Two, both CC0-1.0 with original prompts, matching the superlative packs (`packs/most-likely-to/most-likely-everyday.json`):

- `packs/doodle-bluff/doodle-everyday.json` — `rating: "family"`. Everyday and animal prompts. On by default (`plan/0001-platform-mvp.md:53`).
- `packs/doodle-bluff/doodle-absurd.json` — `rating: "teen"`. Sillier, still classroom-safe.

A pack needs at least `2 × MAX_PLAYERS = 16` prompts to fill an 8-player game without repeats; both starters ship 40+.

Licensing per `CONTRIBUTING.md:75`–`:84`: `CC0-1.0`, original prompts written for the project, inbound = outbound, no NonCommercial content, no Jackbox names or text. The pack `attribution` string states authorship rather than claiming a public-domain *release* of someone else's work — the mistake commit `ec3d6b8` already fixed once for the Imposter packs.

## The gallery, and drawings dying with the room

The gallery is an in-game `gallery` phase before `isOver`, not part of the platform finale. The platform finale runs off `GameResultSummary`, which carries scores, winners and awards only (`packages/protocol/src/index.ts:91`–`:101`), and putting drawings there would put every drawing in every finale broadcast.

**What the gallery costs the snapshot:** every drawing must survive from the draw phase to `isOver`, shown or not. At 8 players that is 16 drawings — **43 KB typical, 261 KB if all 16 max out every cap**, against the 2 MB key-plus-value limit. The arithmetic is in the snapshot table above. Even in a case the rules do not really allow, the gallery uses under 13% of the limit, so **no eviction, no "keep only the shown ones", no compaction is needed.**

**What dies, and when:**

- Drawings live **only** in the Durable Object snapshot at key `"room"` (`apps/worker/src/room-hub.ts:24`, written at `apps/worker/src/room.ts:146`).
- Nothing is written to D1. `match_stats` records game id, player count, duration and completion only (`plan/0001-platform-mvp.md:197`), and this plan adds no column.
- There is no export, no download, no share link and no data URL. The sandbox aside, `intent/0001-platform-mvp.md:141` is explicit that player content is visible only inside the room and is never persisted; a drawing is player content.
- When the room goes idle — no connections and no running game for `IDLE_MS = 2 hours` (`apps/worker/src/room-hub.ts:26`) — the hub closes every socket and calls `storage.deleteAll()` (`apps/worker/src/room-hub.ts:216`–`:226`). The drawings go with it.
- Between games in the same room, the game state is replaced at the next `setup`, so last game's drawings do not survive into the next one.

## Edge cases

| Case | Behaviour |
|---|---|
| A player finishes only one of their two drawings | The finished one is theirs. The unfinished one is dropped and does not enter the shown queue or the gallery |
| A player draws nothing at all | Neither drawing enters the queue. They still title, vote and score normally |
| **A drawing that never arrives** (below `MIN_STROKES = 1`) | **Its slot is filled from the queue**, so the shown count holds. This is what the second drawing is really for: a player's spare covers their blank. If both are blank, the next player's spare fills the slot; if the queue is exhausted the round is skipped and the TV says "That's everything we've got" |
| Artist disconnects during `draw` | The phase ends on the deadline with whatever chunks arrived; partial drawings above `MIN_STROKES` still count |
| Artist kicked before their drawing is shown | Their drawings are dropped from the queue and from the gallery, and the queue refills |
| Artist kicked during their round | The round finishes. Finders and forgers still score; the artist's points are dropped, as `onPlayerRemoved` drops their score entry. Follow MLT's frozen-reveal rule so the ceremony keeps its tiles (`games/most-likely-to/src/state.ts:43`–`:46`) |
| Player kicked during `title` | Their accepted title is removed before the ballot is built |
| Player kicked during `vote` or `reveal` | The option stays (it is already on screen) but is **anonymized** and dropped from the reveal story, exactly as Real or Nah does (`games/real-or-nah/src/index.ts:219`–`:237`). Their vote is dropped, as MLT's `survivingVotes` does (`games/most-likely-to/src/index.ts:177`–`:187`) |
| A title equal to the real prompt | `titleError: "truth"`, rejected, retry allowed, normalized comparison (`games/real-or-nah/src/index.ts:102`) |
| A title duplicating another player's | `titleError: "duplicate"` (`games/real-or-nah/src/index.ts:422`) |
| Empty or over-length title | `titleError: "invalid"` (`games/real-or-nah/src/index.ts:436`–`:447`) |
| A player who submits no title | No option, no fooling points. They may still vote |
| Thin ballot at 3 players | Topped up with house titles, as above |
| Only the artist is connected for a round | No titles can arrive; the round is skipped on the deadline |
| Fewer than `minPlayers` remain | RoomCore already ends the game (`plan/0001-platform-mvp.md:55`) |
| Deploy mid-drawing | Sockets drop, the snapshot holds accepted chunks, the phone reconnects and re-sends from `myStrokeCounts` (`plan/0001-platform-mvp.md:22`, `CLAUDE.md`) |
| A chunk with a stale `drawingId` (a late frame after the phase moved on) | No-op, same state, no broadcast |
| A device joining mid-replay | Finished drawing, no animation, no replayed cues (see the replay section) |

## No-TV mode

A phones-only mode is planned and lands before this game is built; this plan does not design it. **This section assumes no invite link and no QR code exists there — joining is by reading the room code aloud — and Doodle Bluff adds no dependency on either.** Nothing in this game surfaces a link, a QR code or a persistently displayed room code; the code lives in the platform's room chrome, which is the other plan's concern.

**Doodle Bluff opts in.** Its whole point is showing a drawing to the room, and a drawing is data every phone can already render — the pad, the phone's read-only view and the TV all call the same `paintDoodle`. There is no artifact that only a big screen can carry. Phones are never passed around, and nothing here needs them to be: each phone renders the drawing from the view it already receives.

What each phone shows:

- **`draw`** — unchanged, and arguably better. The pad is already the phone's entire screen and the TV shows nothing a player needs. No split attention.
- **`title`** — nearly unchanged. The phone already carries the drawing full-size, because a player cannot write a title without seeing it. Two changes: the replay moves to the phone (same schedule, same `timerStartedAt` anchor, same finished-on-late-join rule), and the TV's "4 of 8 have written" banner moves into the existing `PhoneStrip` (`packages/ui/src/index.ts:141`).
- **`vote`** — unchanged. Options are already on the phone.
- **`reveal`** — **this is the real cost.** Today the reveal is a TV storyboard and the phone deliberately holds back a personal card behind it (`EyesOnTv`, `packages/ui/src/index.ts:53`; the follow model is `plan/0002-game-feel.md:44`). With no TV, the phone must run the *whole* storyboard: the drawing, each fake title with who it fooled, the truth, the artist, the standings. That is a second component, not a re-skin.
- **`gallery`** — the grid moves to every phone. At 16 drawings that is a ~360 KB broadcast across 8 sockets, once, typical (~2.1 MB at the caps). Affordable, but it is the single largest message the game sends, so it wants a swipeable one-at-a-time fallback if the measurement comes in worse than the estimate.

Cost to opt in:

1. One extra Phone component (a solo reveal) plus a phone gallery, both driven by the **same pure `reveal-timeline.ts` and `replaySchedule`** the TV uses. The timeline is already pure data (`plan/0002-game-feel.md:38`–`:40`, with `games/most-likely-to/src/ui/reveal-timeline.ts` as the worked example), so the rules, the protocol, the content and the scoring are untouched. Estimate: one slice, roughly the size of the existing `PhoneReveal.tsx` plus tests.
2. **Every cue needs a visual equivalent, because phones are silent in no-TV mode.** This is already the platform's accessibility baseline — "every audio cue has a visual equivalent" (`intent/0001-platform-mvp.md:84`) — so the work is making it complete rather than inventing a policy. Haptics still fire (`HAPTIC_PATTERNS`, `packages/ui/src/index.ts:57`). Concretely: a drumroll becomes a drawn countdown and a dim; a slam becomes a stamp plus a shake, or a static stamp under reduced motion; a fanfare becomes confetti plus a stated line of text. Slice 6 already owes a cue-to-visual table (`plan/0002-game-feel.md:306`); no-TV mode makes that table load-bearing rather than a courtesy.
3. **Broadcast cost goes down** in the titling rounds: no host socket, so 8 recipients instead of 9, about 11% less. The drawing is already in every player view, so nothing new goes on the wire. The gallery is the one phase where it goes up.

Where it is genuinely worse, stated plainly: a drawing reveal is a *group* moment. The joke lands when eight people see the same bad giraffe at the same instant and react to each other, and the replay is built to make them lean in together. On phones everyone looks down at their own screen and the laugh is staggered. The mode works, it is playable, and it is a meaningfully weaker version of the same game. Recommendation: ship the opt-in, keep the shared screen as the default presentation, and do not tune the TV storyboard down to match what a phone can do.

## Registering the game

Every place a game has to appear, taken from what `most-likely-to` touches outside its own folder:

| File | Change |
|---|---|
| `games/doodle-bluff/package.json` | New workspace package `@opg/game-doodle-bluff`, exports `.`, `./ui`, `./preview` (`games/most-likely-to/package.json:6`–`:10`). Picked up by `pnpm-workspace.yaml`'s `games/*` |
| `apps/worker/package.json:15`–`:17` | Add the workspace dependency |
| `apps/worker/src/games.ts:7` | Add to `GAMES` |
| `apps/web/package.json:13`–`:15` | Add the workspace dependency |
| `apps/web/src/games.tsx:31` | Add to `LANDING_GAMES` — `icon: "pencil"`, which already exists (`packages/ui/src/Icon.tsx:8`, `:54`), so **no new icon is needed**. `gameIconFor` reads from this list (`apps/web/src/games.tsx:66`) |
| `apps/web/src/games.tsx:132` | Add a `registerGame({ ui, hostViewSchema, playerViewSchema })` entry to `GAME_UIS` (`apps/web/src/games.tsx:92`), which parses the view off the wire before rendering |
| `packages/sdk/src/types.ts`, `packages/sdk/src/content.ts`, `apps/worker/src/content.ts` | The content-kind tables listed above |
| `scripts/pack-rules.mjs` | `KIND_BY_FOLDER` and `ITEM_ERRORS_BY_KIND` |
| `e2e/browser/doodle-bluff.ts` + `.spec.ts`, `e2e/api/room.test.ts` | Playthrough driving and the API game loop |
| `README.md`, `CONTRIBUTING.md`, `ROADMAP.md` | Game blurb, pack rules for the new kind, and moving Doodle Bluff into "Built after the MVP" |

## Build slices

Each slice is independently verifiable with `pnpm check`.

### Slice 0 — record the plan
This file. No code.

### Slice 1 — the `canvas` capability, as pure functions
No game yet. `packages/ui/src/doodle/` gains the stroke model, `deltaEncode` / `deltaDecode`, `simplifyStroke`, `gridPointOf`, `doodleBounds`, `replaySchedule`, `replayStateAt`, `paintDoodle` over a narrow structural context, `DOODLE_INKS`, and `DoodlePad` / `DoodleView` components.

**Done when:** every geometry and timing function has node unit tests with no DOM; `DoodlePad` has happy-dom tests injecting a synthetic rect, a fake clock and a recording painter, asserting the stroke model (including `c`, `d` and `g`) after a synthesized pointer drag; the palette swatches are ≥44 px with a non-colour selected marker and an accessible name; undo, clear and resize are covered; a replay mounted past its window renders finished and fires no cues; **measured** typical and cap-case serialized sizes are recorded in the tests, and the room-view byte size is measured and written back into this plan, so the budget stops being an estimate.

### Slice 2 — the `drawing-prompts` content kind
The four per-kind tables, the pack rules including the four-house-title minimum, the two starter packs.

**Done when:** `pnpm validate:packs` passes and rejects a bad pack for each new rule, including a house title that normalizes to the prompt and a prompt with only three house titles; `scripts/pack-rules.test.ts` covers every rule; the worker content tests cover `drawingPromptFromRow`; removing a table entry fails typecheck.

### Slice 3 — game rules
`games/doodle-bluff/src/{state,rules,views,awards,index}.ts`. The draw phase with two prompts each, the chunk action with the `from` check, the shown-drawing queue and `TITLED_MAX`, titling reusing Real or Nah's text rules, ballot building with house top-up, scoring, the gallery phase, `onPlayerRemoved`, awards, bot.

**Done when:** unit tests cover every phase transition, every scoring path (including the artist earning nothing when nobody finds it), every row of the edge-case table, the ballot-size table at 3 players, the shown-drawing selection at 3 and 8 players, and the secrets rule (no view carries another player's prompt or title before reveal, `packages/sdk/src/types.ts:146`); a 3-player and an 8-player `runBotPlaythrough` with `disconnectRejoin` both finish with awards; a chunk replayed after a rejoin is a no-op; a snapshot round-trips through `restoreRoom` with 16 drawings in it.

### Slice 4 — TV and phone UI
`src/ui/`: Host, Phone, `reveal-timeline.ts`, the gallery, `preview.ts`, award copy. The pad wired to the chunk action with client-side batching and the `sessionStorage` mirror.

**Done when:** component tests pass in happy-dom with an injected clock and painter; the replay lands the right frame when mounted mid-phase and fires no replayed cues (`plan/0002-game-feel.md:43`); reduced motion shows the finished drawing; previews render in `/dev/moments` (`plan/0002-game-feel.md:252`).

### Slice 5 — registration and e2e
Every row of the registration table, plus `e2e/browser/doodle-bluff.{ts,spec.ts}` and the API e2e loop.

**Done when:** a full game runs through the real Worker, Room DO and D1; the browser suite drives a real drawing with `page.mouse` on the pad for one drawing and the "Send a squiggle" escape for the rest, so the suite stays fast and deterministic; a phone reloads mid-draw and its strokes survive; the gallery renders every drawing.

### Slice 6 — feel, no-TV mode, playtest
Beats and cues for the reveal and the gallery cascade, the cue-to-visual table, the no-TV solo reveal and phone gallery, the reduced-motion pass.

**Done when:** every cue has a stated visual equivalent and a test; the no-TV reveal plays the whole storyboard on a phone with haptics only; **a real playtest with a TV and 3–8 phones** settles the timing table, the palette, `REPLAY_MS`, and whether 130 s is enough to draw two prompts on a phone.

### Verification checklist

Run before calling any slice done:

- `pnpm check` — packs validate with no errors, Oxlint reports 0 problems, every `typecheck` exits 0, all Vitest tests pass, `crap-typescript` reports no failed methods, Vite prints `built in` (`CLAUDE.md`).
- `pnpm e2e:setup && pnpm e2e` — API and browser suites.
- Bot playthroughs at 3 and 8 players with disconnect and rejoin (`CONTRIBUTING.md:32`, `intent/0001-platform-mvp.md:133`).
- `pnpm dev`, TV at 1920×1080 next to the design files, and a phone at 390×844 — the frame size the design mockups use (`design/PhoneRealOrNahWrite.dc.html`). Check tap targets ≥44 px and phone text ≥16 px (`CLAUDE.md`, `design/AVATARS.md:24`).
- A real phone on LAN, not just device emulation, because the pad is the one screen where a mouse lies about the experience.
- No `oxlint-disable`, no edits to `.oxlintrc.json` or coverage settings, no casts to silence a rule (`CLAUDE.md`, `CONTRIBUTING.md:17`).

## Risks

- **Broadcast bandwidth is the binding constraint, and the numbers above are estimates.** The ~2 KB room view is unmeasured. If it is 6 KB, the per-game figure triples. Slice 1 measures it before slice 3 commits to the view shape.
- **Drawing two prompts on a phone in 130 s is the hardest thing here to get right**, and no amount of unit testing settles it. It is a playtest question, and the timing table may move a lot.
- **At 6–8 players, six of sixteen drawings are never titled.** The gallery and the spare-drawing rule are the mitigations, but a player whose second drawing was their good one will feel it. Decision D2.
- **Three- and four-player games run short** — 10 and 13 minutes against a ~15 minute standard — because two drawings each is not enough content. Decision D2.
- **iOS Safari pointer behaviour.** `touch-action: none`, rubber-band scrolling, `pointercancel` fired by system gestures, and the address bar resizing the viewport mid-stroke. The `ResizeObserver` repaint covers the last; the rest needs a real device.
- **happy-dom cannot render a canvas or report a layout rect**, so anything that drifts back into impure geometry or impure timing silently loses its test coverage and its CRAP score. The pure-function rule has to hold across every slice, not just slice 1.
- **The gallery is the single largest message the game sends** — one broadcast carrying every drawing. Affordable once, but a reconnect storm during the gallery phase would repeat it. Worth watching in the playtest.
- **Snapshot writes during the draw phase** grow with accumulated ink — ~16 writes against a snapshot heading toward 43 KB typical, 261 KB at the caps. Well inside the 2 MB limit, but more write volume than any existing game, and `plan/0001-platform-mvp.md:299` flags Durable Object billing.
- **Prompt quality is the whole game.** A prompt that is not drawable, or that needs reading, kills a round, and a weak set of house titles makes a 3-player ballot obvious. There is no machine check for either; it is reviewer work.
- **Scope creep toward live sync.** The moment someone asks "why doesn't the TV show it as they draw", the cost model above is the answer.
- **The e2e browser suite drawing for real is slow.** Hence the "Send a squiggle" escape, which exists for accessibility first and pays for itself twice.

## Decisions

The maintainer settled ink, drawings per player, replay, the gallery, house titles and artist scoring before this draft; those are in the decisions table above. D1-D6 were settled on 2026-09-18, recorded here. Every recommendation was accepted; the reasoning is kept because it is the reason each decision holds.

**D1 — Protocol change or chunked upload.** **Decided: chunked upload, no protocol change.** `MAX_MESSAGE_LENGTH` is one length check on the raw frame before parsing (`packages/protocol/src/index.ts:227`), so it cannot be raised for a single action without weakening the guard for every message from every socket — and a drawing at the caps would need chunking anyway. Chunking costs nothing in the typical case, because a typical drawing fits in one chunk. Trade-off accepted: the rules carry a `from` cursor and a `doodle-done` action that a single-frame upload would not need, and the view has to expose `myStrokeCounts` so a reconnecting phone knows where to resume.

**D2 — How the shown count scales, and the short small-room game.** **Decided: `shownCount(n) = min(2n, 10)` with a flat 77 s round**, giving the timing table above: flat ~15.3 minutes from 5 to 8 players, 10.2 at 3 and 12.8 at 4. The alternatives are a per-player-count clock (fiddly to test, hard to explain, and it makes a 3-player game feel padded rather than shorter) or showing all 16 at 8 players (20+ minutes of titling, past the platform standard). The small-room end was the open part: leave 3- and 4-player games short, or spend the saved minutes on a longer reveal and a longer gallery there. **They stay short, and get revisited at the slice 6 playtest**, since the 77 s round is itself a guess.

**D3 — Where `DOODLE_INKS` lives.** **Decided: `packages/ui`, not the game package.** The draw-your-own-avatar picker that `intent/0001-platform-mvp.md:56` promises is the next caller, and Sketch Phone and Shirt Fight (`ROADMAP.md:54`, `ROADMAP.md:86`) are the ones after that. The design pass owns all six hex values; the palette table above holds placeholders for indices 2–5 until it runs (D7).

**D4 — Whether the replay carries per-stroke timing or is paced synthetically.** **Decided: per-stroke `d` and `g`, as specified above.** Synthetic pacing off point counts would cost zero bytes and is a real option — at 2.2 s nobody is auditing the rhythm. The reason to store timing is that a hesitation before the punchline detail is the thing that makes a replay feel like watching a person rather than a plotter, and 18% of a 2.7 KB payload is a cheap price. If slice 1's measurements come in worse than estimated, dropping `g` alone recovers half of it with most of the character intact.

**D5 — Whether the gallery is host-only or mirrored to phones in TV mode.** **Decided: host-only in TV mode**, phones showing "look up". It keeps the largest message in the game down to a single socket (~45 KB rather than ~405 KB) and it is the right staging — a gallery is something a room looks at together. No-TV mode necessarily mirrors it to phones. The counter-argument is that a player might want to see their own drawing up close, which a "show me mine" tap could serve without putting all 16 in every view.

**D6 — Mirroring in-progress strokes to `sessionStorage`.** **Decided: yes, on stroke end.** A phone reload mid-draw currently loses everything, and with two drawings and a 130 s phase there is more to lose than in any other game. At most ~33 KB, keyed per room and drawing, dead when the tab closes, every access wrapped because a private window throws. The cost is one more thing that can go stale; the `drawingId` key makes staleness harmless.

**D7 — Design artboards before UI code.** Same rule no-TV mode adopted. The pad, the six-ink palette, the TV drawing card and the finale gallery get `design/*.dc.html` artboards, approved, before any component is written, and **the design pass owns the six `DOODLE_INKS` hex values** rather than the placeholders in the palette table above. The pad is the one screen in the product where a mouse lies about the experience, so settling its geometry on paper first is cheaper than discovering it on a phone.

**D8 — Scope is slices 1 through 6.** Including the no-TV opt-in, which is why no-TV mode lands first. The human playtest that slice 6 calls for — real phones, a real TV, and the question of whether 130 s is enough to draw two prompts — stays with the maintainer.
