# Plan: OpenPartyGames platform MVP

Author: Asaf Shitrit. Status: in progress.
Inputs: [intent/0001-platform-mvp.md](../intent/0001-platform-mvp.md), the design screens in [design/](../design/) (static `.dc.html` mockups; open them in a browser at their frame size), and the contracts in `packages/protocol/src/index.ts` and `packages/sdk/src/types.ts`.

The spec stage is folded into this plan: game rules, scoring and the room engine rules below are the requirements.

## Architecture

```
Phone / TV browser ──HTTP──▶ Worker (apps/worker) ──▶ static assets (apps/web/dist)
        │                         │
        └──WebSocket /ws/CODE────▶ Room Durable Object (one per room code)
                                   ├─ RoomCore (packages/sdk): pure room + game engine
                                   ├─ games (games/*): pure GameDefinitions
                                   └─ D1: content packs, daily room counter, match stats
```

- **Server-authoritative.** RoomCore is a pure, deterministic state machine. The Durable Object is a thin adapter: it feeds messages, the clock and content into RoomCore, persists `room.snapshot()` after every change, re-broadcasts views, and arms an alarm for `room.nextDeadline()`.
- **Full views, no diffs.** After every change each socket gets its own complete view (`hostView` or `playerView`). Rooms have at most 9 sockets, so this stays small and makes reconnects trivial.
- **No secrets on the wire.** A player's view never contains another player's secret (imposter identity, decoy word, which option is the truth).
- **Deploy-safe.** Deploys restart every Durable Object and drop sockets. Clients reconnect with their token and receive their view again; the snapshot makes this invisible apart from a short "Reconnecting…".

## Repository layout

```
apps/web/            React 19 + Vite app: host stage (TV) and phone UI
apps/worker/         Worker entry, Room Durable Object, D1 migrations, wrangler.jsonc
packages/protocol/   Wire types + parseClientMessage (DONE, contract)
packages/sdk/        Game SDK types (DONE, contract), rng, RoomCore, text utils, testing harness
packages/ui/         Doodle Notebook UI kit: tokens, fonts, components, avatars, GameUi type
games/imposter/      src/index.ts (GameDefinition), src/*.test.ts, src/ui/ (React Host/Phone)
games/real-or-nah/   same shape
packs/imposter/      word-pair packs (JSON)
packs/real-or-nah/   fact packs (JSON)
scripts/             validate-packs.mjs, build-pack-seed.mjs
```

Workspace packages export TypeScript source directly (`"exports": {".": "./src/index.ts"}`); Vite, Wrangler and Vitest compile it. Dependencies are already installed; jobs must not add or upgrade dependencies (report back instead).

## Room engine rules (packages/sdk/src/room.ts)

- `createRoom` starts in `lobby`, `lobbyScreen: "join"`, unlocked, `selectedGameId` = first game in `games`.
- **Host:** `host-hello` with the right token replies `welcome{role:host}`; a wrong token replies `error host-token-invalid`. Several host sockets may be connected.
- **Join** (`join` from an anonymous caller):
  - With a `token` matching a player: rejoin. Same id, score and seat; mark connected; reply `welcome` with the same token.
  - Otherwise a new player. `cleanPlayerName` → `name-invalid`; case-insensitive duplicate → `name-taken`; 8 players → `room-full`; locked → `room-locked`. Id and token come from `newToken()`. The new player gets the first free avatar automatically.
  - Joining during `starting`/`in-game` sets `waitingForNextGame: true`; they are not in the running game.
- **Avatars:** `set-avatar` taken by someone else → `avatar-taken`.
- **VIP:** the first player to join. If the VIP is kicked, or disconnected for more than 60 seconds (checked by `tick`; include it in `nextDeadline`), VIP passes to the earliest-joined connected player.
- **VIP-only messages** (anyone else → `not-vip`):
  - `pick-game` (lobby only): unknown id → `invalid-action`. Sets `lobbyScreen: "pick"`.
  - `set-pack` (lobby only): pack must match the selected game's `contentKind`. Sets `lobbyScreen: "pick"`. Pack defaults: on for family/teen, off for adult (per room, keyed by pack id).
  - `set-locked` (any phase).
  - `kick` (not yourself): remove the player, emit `disconnect-player`. If a game is running, call `onPlayerRemoved`. If fewer than the game's `minPlayers` remain, end the game (not completed).
  - `start-game` (lobby): needs connected non-waiting players ≥ `minPlayers` (else `not-enough-players`) and ≥ 1 enabled pack (else `invalid-action`). Moves to `starting` and emits `load-content` with the enabled pack ids. Game players = all non-waiting players at this moment.
  - `skip-phase` (in-game): calls `onDeadline` immediately.
  - `end-game` (in-game): back to lobby with `lastResult` from current scores; no crowns; emits `game-finished{completed:false}`.
- **`beginGame(content)`:** if the content has no items, call `abortStart`. Otherwise `setup` and move to `in-game`. `abortStart` returns to lobby.
- **`game-action`** from a player in the game: `parseAction` null → `invalid-action`; else `onAction`.
- **`tick(now)`:** repeatedly apply `onDeadline` while `nextDeadline <= now` (cap at 50 iterations), and handle the VIP disconnect timeout.
- **Game over** (checked after every game change): `scores`; winners = everyone with the top score if it is > 0; winners get `crowns + 1`; set `lastResult`, `lobbyScreen: "results"`; clear `waitingForNextGame`; emit `game-finished{completed:true}`.
- **Views:** `game` is `{id, view, deadline}` in-game. Waiting players get `view: null`. Game context `players` are the game's players (with current names/avatars); `connectedIds` are those of them connected now.
- **Snapshot:** everything, including rng state, tokens, host token, pack catalog and game state. `restoreRoom(snapshot, games, newToken)` resumes exactly.
- `isIdleSince(now, idleMs)`: no socket connected and no game running for `idleMs`.

`normalizeAnswer(text)`: lowercase, trim, strip punctuation, drop a leading "a ", "an " or "the ", collapse inner whitespace.

### Testing harness (packages/sdk/src/testing.ts)

- `runBotPlaythrough(options: PlaythroughOptions): PlaythroughResult` drives a real RoomCore:
  1. Create the room and send `host-hello`.
  2. Join N bots (names Bot1…BotN) and have the VIP pick the game.
  3. `start-game`, then `beginGame(content)`.
  4. Loop: each player's bot policy acts on its own `playerView`. When no bot acts, advance the fake clock to `nextDeadline()` and `tick`.
  5. With `disconnectRejoin`, disconnect bot 2 partway through and rejoin it by token a few steps later. Assert the same player id and a non-decreasing score.
- `createMemoryContentSource(packs)` is the in-memory `ContentSource` for tests.

## Imposter (games/imposter)

Constants (export them; the UI uses them): `WORDS_PER_GAME = 6`, `WORD_CHECK_MS = 8000`, `CLUE_TURN_MS = 30000`, `VOTE_MS = 45000`, `REVEAL_MS = 7000`, `LAST_CHANCE_MS = 15000`, `RESULT_MS = 8000`. Content kind `word-pairs`. min 3, max 8 players, `minutes: 15`.

- **Setup:** pick `min(6, items.length)` pairs without repeats (rng shuffle). Per word, swap crew/decoy with 50% chance. The imposter is picked with rng, avoiding the previous word's imposter when possible.
- **Phases per word:**
  1. `word-check` (8s): everyone reads their phone.
  2. `clues`: turn order starts at player index `wordIndex % n` and wraps. If the imposter would go first, swap them with the second speaker. Each turn is 30s. The speaker ends it early with `{type:"done"}`. Speakers not in `connectedIds` are skipped immediately.
  3. `vote` (45s): `{type:"vote", target}` once, for anyone but yourself. Ends early when every connected game player has voted.
  4. `reveal` (7s): count votes. **Caught** = one unique top vote-getter, and it is the imposter.
  5. If caught, `last-chance` (15s): the imposter sends `{type:"guess", text}` once. It ends on the guess or the deadline.
  6. `result` (8s), then the next word or game over.
- **Scoring per word:**
  - Caught, wrong or missing guess: every player who voted for the imposter gets +500.
  - Caught, right guess (`normalizeAnswer` equality with the crew word): imposter +1000, voters get 0.
  - Not caught: imposter +1000.
- **HostView:**
  - Always: `phase`, `wordNumber`, `wordCount`, `playerIds`, `clueOrder`, `currentSpeakerId`, `doneSpeakerIds`, `votedIds`, `totals`.
  - From `reveal` on: `tally: Record<PlayerId, PlayerId[]>`, `imposterId`, `caught`, `decoyWord`.
  - In `result` only: `crewWord`, `guess`, `guessCorrect`, `pointsThisWord`.
- **PlayerView:**
  - Always: `phase`, `wordNumber`, `wordCount`, `role: "crew" | "imposter"`, `word` (their own word only), `clueOrder`, `currentSpeakerId`, `isMyTurn`, `nextSpeakerId`, `myVote`, `voteCandidates`, `votedCount`, `totals`.
  - From `reveal` on: `imposterId`, `caught`.
  - `last-chance`: `isMyLastChance`, `decoyWord` (imposter only), `myGuess`.
  - `result`: `crewWord`, `guess`, `guessCorrect`, `myPoints`.
  - A crew member's view never has the decoy word or `imposterId` before reveal.
- **Bot:** done on my turn; vote for a random candidate; as a caught imposter, guess its own decoy word.

## Real or Nah (games/real-or-nah)

Constants: `FACTS_PER_GAME = 6`, `WRITE_MS = 60000`, `VOTE_MS = 30000`, `REVEAL_MS = 12000`, `LIE_MAX_LENGTH = 40`, `MIN_OPTIONS = 4`. Content kind `facts`. min 3, max 8, `minutes: 15`.

- **Setup:** pick `min(6, items.length)` facts without repeats.
- **Phases per fact:**
  1. `write` (60s): `{type:"lie", text}`. Clean the text (trim, collapse spaces); it must be 1–40 characters.
     - If it normalizes equal to the answer or an alternate, reject with `lieError: "truth"`.
     - If it matches another player's accepted lie, reject with `lieError: "duplicate"`.
     - Any other invalid text gets `lieError: "invalid"`.
     - One accepted lie per player. The phase ends early when every connected game player has one.
  2. **Build options:** the truth, plus every accepted lie, plus house decoys (skip any equal to an existing option) until there are at least 4. Shuffle, and give ids `o1…`.
  3. `vote` (30s): `{type:"pick", optionId}` once; you can't pick your own lie. Ends early when every connected game player who can pick has picked.
  4. `reveal` (12s), then the next fact or game over.
- **Scoring per fact:** +1000 for picking the truth. A lie's author gets +500 per player it fooled. House decoys have no author.
- **HostView:**
  - Always: `phase`, `factNumber`, `factCount`, `prompt`, `playerIds`, `submittedIds`, `votedIds`, `totals`.
  - From `vote` on: `options: {id, text}[]`.
  - In `reveal`: `reveal: { truthOptionId, answer, source, foundByIds, lies: {optionId, text, authorId | null, fooledIds, points}[] }`, `pointsThisFact`.
- **PlayerView:**
  - Always: `phase`, `factNumber`, `factCount`, `prompt`, `myLie`, `lieError`, `submittedCount`, `playerCount`, `myPick`, `totals`.
  - From `vote` on: `options: {id, text, mine}[]`.
  - In `reveal`: `reveal` (same shape as the host's), `myPoints`.
  - No view reveals which option is the truth before `reveal`.
- **Bot:** submit `"bot lie <id> <factNumber>"`; pick a random option that isn't mine.

## Content packs

`packs/imposter/<id>.json`:
`{ "id", "name", "kind": "word-pairs", "rating": "family"|"teen"|"adult", "language": "en", "license": "CC0-1.0"|"CC-BY-4.0"|"CC-BY-SA-4.0", "attribution", "items": [{ "crew", "decoy" }] }`

`packs/real-or-nah/<id>.json`: same header with `"kind": "facts"`, and items shaped like the `Fact` type (`prompt` with exactly one `____`, plus `answer`, `alternates`, `decoys`, `source`).

**`scripts/validate-packs.mjs` checks:**
- Pack header:
  - `id` is kebab-case and equals the filename.
  - `kind` matches the folder.
  - `rating`, `language` and `license` are allowed values.
  - `items` is non-empty.
- Word pairs:
  - `crew` and `decoy` are non-empty, at most 24 characters, and lowercase.
  - `crew` differs from `decoy`.
  - `crew` values are unique in the pack.
- Facts:
  - `id` values are unique.
  - `prompt` has exactly one `____`.
  - `answer` is at most 40 characters.
  - At least 2 decoys, none normalizing equal to the answer or an alternate.
  - `source.url` starts with `https://`.

Exit code 1 with a readable list of errors.

`scripts/build-pack-seed.mjs` runs the same validation, then writes `apps/worker/.wrangler/pack-seed.sql`: it deletes and reinserts every pack in `packs` and `pack_items`.

## Worker and Durable Object (apps/worker)

`wrangler.jsonc`:
- `main: src/index.ts`, `compatibility_flags: ["nodejs_compat"]`, and a recent `compatibility_date`.
- `assets`: `{ directory: "../web/dist", binding: "ASSETS", not_found_handling: "single-page-application", run_worker_first: ["/api/*", "/ws/*"] }`.
- A `ROOMS` Durable Object binding for class `Room`, with migration `new_sqlite_classes: ["Room"]`.
- A D1 binding `DB` with `database_name: "openpartygames"`, a placeholder `database_id`, and `migrations_dir: "migrations"`.
- `vars: { DAILY_ROOM_CAP: "150" }`.
- Rate limit bindings `CREATE_LIMITER` (10/min) and `JOIN_LIMITER` (60/min) if this Wrangler version supports `ratelimits`. Code must work when they're absent.

Routes (`src/index.ts`):
- `POST /api/rooms`:
  - Rate limit by `CF-Connecting-IP`, then increment `daily_rooms(day)`. Over the cap → 429 `{error:"full-tonight"}`.
  - Pick a random code from `ROOM_CODE_ALPHABET` and call the `init` RPC on that stub, which returns false if the room is active. Retry up to 10 times.
  - Returns `CreateRoomResponse`. The host token comes from `crypto.randomUUID()`.
- `GET /api/rooms/:code` → `RoomInfoResponse` (rate limited, 404 for an unknown or invalid code).
- `GET /ws/:code` → rate limit, validate the code, forward the upgrade to the Room stub.
- `GET /api/health` → `{ok:true}`.

`Room extends DurableObject` (`src/room.ts`):
- Restore from `ctx.storage.get("room")` inside `blockConcurrencyWhile`. Use `setWebSocketAutoResponse` for `"ping"` → `"pong"`.
- Accept sockets with `ctx.acceptWebSocket` (hibernation). Keep the caller in `serializeAttachment`.
- `webSocketMessage`:
  1. `parseClientMessage`; null → `error bad-message`.
  2. `room.handle`. When a `welcome` goes to a player, update that socket's attachment.
  3. Apply the result: persist, send the replies, broadcast views to every socket, run the effects, re-arm the alarm.
- `load-content`: read `pack_items` from D1 → `beginGame`. On any error → `abortStart`.
- `game-finished` → insert into `match_stats`.
- `webSocketClose`/`webSocketError` → `setConnected(false)` when no other socket belongs to that player (or host).
- `alarm()` → `tick`. When `isIdleSince(now, 2h)`, delete storage. Otherwise re-arm for the earlier of the next deadline and the idle check.
- On `init`, load the pack catalog from D1 (`packs` table) into `setPackCatalog`.

`migrations/0001_init.sql`:
- `packs(id PK, name, kind, rating, language, license, attribution, item_count)`
- `pack_items(pack_id, idx, data JSON TEXT, PK(pack_id, idx))`
- `daily_rooms(day TEXT PK, count INTEGER)`
- `match_stats(id INTEGER PK AUTOINCREMENT, game_id, player_count, duration_ms, completed INTEGER, finished_at INTEGER)`

## UI kit (packages/ui)

Match the Doodle Notebook designs exactly (tokens from `design/Main.dc.html` and the others):
- **Colors:** paper `#FBF8F1` with a 2px `#E4ECF6` grid, ink `#2B2B2B`, secondary `#555555`, marker red `#D7372B`, highlighter `#FFE45C`.
- **Borders:** wobbly radii, 4px ink borders, small tilts.
- **Fonts:** Permanent Marker for headings/stamps only; Atkinson Hyperlegible for everything else. Load them via `@fontsource` imports in `styles.css`, no Google Fonts requests.
- **Motion:** respect `prefers-reduced-motion`.

Exports:
- **Layout:** `Stage` (fixed 1920×1080 surface scaled to fit the window, letterboxed), `PhoneScreen` (max-width 480px column).
- **Surfaces and text:** `Card`, `StickyNote`, `LinedCard`, `Tape`, `Highlight`, `Marker`, `Stamp`.
- **Controls:** `Button` (primary/secondary, disabled), `Chip`, `Switch` (with On/Off text), `TextInput`.
- **Game pieces:** `Timer` (hand-drawn circle; props `deadline`, `clock`), `Avatar` (12 ids from `AVATARS`), `Crown`, `Tally`, `Icon` (sound, check, pencil, lock, eye-off, arrow-right, plus, reload, mask, cards, monitor).
- **Chrome:** `TvHeader` (wordmark variant; in-game variant with game name, progress, room chip, sound toggle), `PhoneStrip`, `PlayerChip`.
- **`useServerClock(serverNow)`** returns `ServerClock { now(): number }`, corrected for skew.
- **The `GameUi` type:**

```ts
export interface ServerClock { now(): number }
export interface GameUi<HostView = unknown, PlayerView = unknown, Action = unknown> {
  Host: React.ComponentType<{ view: HostView; room: HostRoomView; deadline: number | null; clock: ServerClock }>;
  Phone: React.ComponentType<{ view: PlayerView; room: PlayerRoomView; deadline: number | null; clock: ServerClock; send: (action: Action) => void }>;
}
```

Avatar SVG paths and colors are listed in `design/AVATARS.md`.

## Web app (apps/web)

Routes (a tiny pathname router, no router dependency):
- `/`: narrow touch screens (`(max-width: 700px) and (pointer: coarse)`) get the phone join screen. Otherwise the TV landing.
- `/join`: phone join screen.
- `/<CODE>` (matches `ROOM_CODE_RE`): phone join with the code prefilled, then the phone room at the same URL.
- `/host/<CODE>`: the host stage. Needs `localStorage["opg:host:<CODE>"]`; without it, show "This room is hosted on another screen".
- `/credits`, `/privacy`: static TV-style pages.

Connection (`useRoomSocket`):
- WebSocket to `/ws/<CODE>`. On open, send `host-hello` or `join` (with the stored `opg:player:<CODE>` token and name).
- Reconnect with backoff (0.5s → 5s). Ping every 25s.
- Expose `status: "connecting" | "open" | "reconnecting" | "closed"`, the latest `view`, `send`, and `lastError`.
- Show the reconnecting screen/overlay while `status === "reconnecting"`.

Screen mapping (design file → when it's shown):

| Surface | Condition | Design |
|---|---|---|
| TV | `/` landing | `TVLanding.dc.html` |
| TV | lobby, `lobbyScreen: "join"` | `Main.dc.html` |
| TV | lobby, `lobbyScreen: "pick"` | `TVGamePicker.dc.html` (add a Room chip to the header) |
| TV | lobby, `lobbyScreen: "results"` | `TVFinalScores.dc.html` |
| TV | create room returned full-tonight | `TVFullTonight.dc.html` |
| TV | `/credits` | `TVCredits.dc.html` |
| TV | in-game | game `Host` component (`TVImposter*.dc.html`, `TVRealOrNah*.dc.html`) |
| Phone | not joined | `PhoneJoin.dc.html` |
| Phone | just joined (once per join) | `PhoneAvatarPicker.dc.html` |
| Phone | lobby, not VIP | `PhoneLobby.dc.html` |
| Phone | lobby, VIP | `PhoneVIPControls.dc.html` |
| Phone | in-game, waiting | `PhoneWaitingNextGame.dc.html` |
| Phone | in-game | game `Phone` component (`PhoneImposter*.dc.html`, `PhoneRealOrNah*.dc.html`) |
| Phone | reconnecting | `PhoneReconnecting.dc.html` |

Dev: Vite on 5173 proxies `/api` and `/ws` (with `ws: true`) to `http://127.0.0.1:8787`, where `wrangler dev` runs.

## Order of work

**Wave 1** (parallel, disjoint folders):
1. `packages/sdk` implementation: rng, text, room, testing, plus tests.
2. `apps/worker`: Worker, Room DO, migrations, seed script integration.
3. `packages/ui` + `apps/web` shell and platform screens, with game components stubbed.
4. `games/imposter` logic, bot, rules tests, bot playthrough tests (3 and 8 players, disconnect/rejoin).
5. `games/real-or-nah` logic, the same way.
6. `scripts/validate-packs.mjs`, `scripts/build-pack-seed.mjs`, word-pair packs.

**Wave 2** (after wave 1 is verified):
7. `games/imposter/src/ui`: Host and Phone components.
8. `games/real-or-nah/src/ui`: the same.
9. Integration: game registry in the worker and web, end-to-end local run, CI workflow, README, CONTRIBUTING, LICENSE.

## End-to-end tests

Both suites run against the real Worker, Room Durable Object and a local D1 seeded from `packs/`, started by `wrangler dev` on a dedicated port with its own `--persist-to` directory (migrated and seeded by `scripts/e2e-setup.mjs`, wiped before each run).

- **API e2e** (`e2e/api/*.test.ts`, `pnpm e2e:api`, Vitest with its own config, not part of `pnpm test`): Node `ws` clients act as host and 3–4 phones.
  - Create a room over HTTP, connect the host, join players, set avatars, and have the VIP pick each game and start it.
  - Play complete games of Imposter and Real or Nah with simple policies driven by each client's own player view, until `lobbyScreen` is "results" and crowns are awarded.
  - Also cover a player socket closing mid-game and rejoining with its token (same seat and score), a non-VIP being refused, a wrong host token, a bad room code (404), and malformed frames getting `bad-message`.
- **Browser e2e** (`e2e/browser/*.spec.ts`, `pnpm e2e:browser`, Playwright + Chromium):
  - The web app is built and served by `wrangler dev` (production-like assets).
  - One desktop page is the TV; three mobile-viewport browser contexts are phones.
  - The TV clicks "Start a room"; the phones open `/<CODE>`, join with names, pick avatars; the VIP phone picks a game and starts it.
  - Players use the real phone UI (typing lies, voting, "I'm done", guesses) through a full game of each title, asserting the key TV text per phase and the final scores screen.
  - Also covers reconnecting: reload a phone mid-game and continue.
- The VIP phone gets in-game controls ("Skip" and "End game") from the room engine's `skip-phase` and `end-game`; the browser suite uses them only in a dedicated test.

## Risks

- **RoomCore is the riskiest piece:** VIP handoff, late joins and kicks mid-game. It gets the most tests.
- **Parallel jobs code against contracts before implementations exist.** Contracts are frozen for wave 1; changes go through the orchestrator.
- **Real or Nah content accuracy:** facts are hand-checked and every item cites its source; community packs go through PR review.
- **Wrangler feature drift** (rate limit bindings, assets config): verify with `wrangler dev` locally.
- **Durable Object billing:** keep message counts bounded (one view broadcast per change; no per-frame sync).

## Proof

- `pnpm validate:packs` passes.
- `pnpm typecheck` passes for every workspace.
- `pnpm test`: RoomCore unit tests, rules tests for both games, and bot playthroughs at 3 and 8 players with disconnect/rejoin, all green.
- `pnpm build` produces `apps/web/dist`.
- With `pnpm dev`, one TV tab and 3+ phone tabs (separate browser profiles or incognito) can create a room, join, pick either game and play it start to finish.
