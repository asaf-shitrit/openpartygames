# Plan: No-TV mode (a room with no shared screen)

Author: Asaf Shitrit.
Status: **decided and being built.** Every open decision in this draft was settled on 2026-09-18; §10 records how. Where an earlier section still reads "proposed", §10 is what was chosen.
Inputs: [intent/0001-platform-mvp.md](../intent/0001-platform-mvp.md), [plan/0001-platform-mvp.md](0001-platform-mvp.md), [plan/0002-game-feel.md](0002-game-feel.md), [ROADMAP.md](../ROADMAP.md).

Two reading conventions:

- **Verified** means I read it. Every such claim cites `file:line`.
- **Proposed** marked a recommendation while this was a draft. All of them were accepted; see §10.
- Line numbers are from the `most-likely-to` branch (PR #5), which this branch is based on, so citations under `games/most-likely-to/` resolve.

Scope of the build: slices 1 through 5. Design artboards are written and approved before any UI code (§9). The human playtest (§10.14) stays with the maintainer.

## Context

Today a room needs a shared screen. One device opens `/host/<CODE>` and shows the stage; everyone else plays on a phone. `CLAUDE.md:3` states it as the product: "one host screen (TV/laptop) plus phones joining by room code." The intent doc is the same: a host screen creates the room and shows a code plus a QR, players join from their phone browser, and the first phone to join is the VIP (`intent/0001-platform-mvp.md:22-24`). Phones deliberately carry only the essentials — "Phones always mirror the essentials (current prompt, whose turn it is, the timer) … Reveals and animations stay on the host screen" (`intent/0001-platform-mvp.md:63`, repeated as a decision at `:185`).

No-TV mode is a second way to play: every player is on their own phone, nobody has a TV or a laptop, and no device is passed around or propped up. Each phone carries both the shared stage and that player's own controls. **TV mode keeps working exactly as it does today.** This is additive.

### Decisions made with the maintainer, before this draft

| Topic | Decision |
|---|---|
| Shape | One mode only: no shared screen anywhere. Not a phone acting as a stage, not a host device that also plays, not a TV taking input |
| Devices | Every player on their own phone, looking at their own screen. Nothing is passed around or held up |
| Support | **Opt-in per game.** A game declares whether it plays with no shared screen; the default is that it does not |
| Which games | **Most Likely To and Imposter opt in. Real or Nah stays TV-only** for now (§6) |
| Sound | **Stays off.** Phones remain silent, haptics only. No nominated speaker phone |
| Joining | People **read the room code aloud**, the same 4 consonants the TV shows today. ~~No invite-link share sheet, no QR on the starter's phone~~ — **reversed after the mode shipped, see §10.18** |
| Order | This mode lands **before the next game**, with those two games retrofitted as part of it |

## What I verified first

The single most useful finding: **the room engine already runs a room with no host socket, today, with no changes.**

- `hasConnection()` is `hostConnected || any player connected` (`packages/sdk/src/room.ts:276-278`).
- `isIdleSince` needs no connection *and* the lobby phase (`room.ts:636-641`), so a running game is never swept.
- `setHostConnected` says so outright: "Host presence is not part of any view" (`room.ts:562-565`).
- The host token is only ever read by `host-hello` (`room.ts:645-656`). If nobody sends it, it is simply unused.
- The VIP is the earliest-joined connected player (`room.ts:306-315`), with a 60s grace after a disconnect (`room.ts:42`, `:317-322`). No host involvement.

So the work is not in the room engine. It is in **what a phone renders**, **how a room gets created and joined without a screen to look at**, and **which games say they can do it**.

## 1. Where the shared stage goes

### The stage is the host view, sent to phones

The host view is already the platform's definition of "what everyone in the room may see right now". It is built phase by phase to withhold secrets: Imposter hides the tally, the imposter's id and the decoy word until the reveal, and the crew word and the guess until the result (`games/imposter/src/views.ts:49-78`); during last-chance the host view carries the guess *length* and never the letters (`views.ts:29-33`, `games/imposter/src/state.ts:139-140`).

**Proposed:** in a no-TV room, a player's `ActiveGameView` carries the host view alongside their own view, in a new `stage` field. Nothing is recomputed and no per-game view schema changes.

```ts
// packages/protocol/src/index.ts — ActiveGameView, currently :103-111
export interface ActiveGameView {
  id: string;
  view: unknown;
  /** The host view, for a no-TV room only; null otherwise. Everything in it is already public. */
  stage: unknown;
  deadline: number | null;
  timerStartedAt: number | null;
}
```

One change in `RoomCore.activeGame` (`room.ts:1159-1175`) sets it. Every game gets the stage for free, and a game can never put something on the stage that is not already on the TV.

### How it composes per phase

The phone gets two stacked regions: **stage on top, your controls below.** The stage is whatever the room is doing; the controls are yours. The existing `PhoneScreen` column (max-width 480, `packages/ui/src/layout.tsx:56-75`) already stacks this way.

For the two games that opt in:

| Game | Phase | Stage region | Controls region |
|---|---|---|---|
| Most Likely To | vote | prompt, who has voted | your ballot |
| | reveal | tally, outcome, standings | your result line |
| Imposter | word-check | **nothing** (see §4) | your face-down card |
| | clues | the clue order, whose turn, who has spoken | "I'm done" on your turn |
| | vote | who has voted (never whom) | your ballot |
| | reveal | tally marks, verdict, 12s | your personal line |
| | last-chance | blank tiles from `guessLength`, timer | imposter: keyboard. crew: nothing |
| | result | the word, the guess, points, standings | your points |

### How much has to be reimagined rather than scaled down

None of the TV presentation can be scaled. `Stage` is a fixed 1920×1080 surface scaled to fit (`packages/ui/src/layout.tsx:12-48`) and TV type runs 28–176px (`design/AVATARS.md:23`; the lobby room code is 176px, `apps/web/src/screens/TvLobby.tsx:143`). At 390px wide that is 5–6px text. Every stage section is new artwork at phone scale.

What has to be re-imagined, by size:

| Game | TV presentation | Lines |
|---|---|---|
| Most Likely To | `ui/Host.tsx` 252, `ui/HostReveal.tsx` 676 | ~928 |
| Imposter | `ui/Host.tsx` 651, `ui/HostReveal.tsx` 808, `ui/HostResult.tsx` 823, `ui/HostLastChance.tsx` 193 | ~2,475 |
| *(Real or Nah, not in scope)* | `ui/Host.tsx` 448, `ui/HostReveal.tsx` 553 | *~1,001* |

What survives untouched: **all the timing logic.** The beat timelines are already pure modules shared by TV and phone — `games/imposter/src/ui/reveal-timeline.ts`, `result-timeline.ts`, `apps/web/src/screens/finale-timeline.ts`. Only the painting is new, and roughly a third of each TV file is layout constants and TV-sized styling that has no phone equivalent anyway.

**Proposed** structure: the game's existing `Phone` component keeps owning the phase switch, and each stage section lives in its own small file (`games/<id>/src/ui/stage/<Phase>.tsx`) so CRAP stays under 8. No third top-level component per game: a second phase switch would have to be kept in sync with the first forever.

## 2. Sync

**Verified: yes, every phone can stage the same moment at the same time, and this already happens today.**

- RoomCore re-anchors `timerStartedAt` whenever the deadline value changes (`room.ts:339-351`), and ships it in `ActiveGameView` (`packages/protocol/src/index.ts:103-111`).
- `anchorAt` prefers it over `deadline − duration` (`packages/ui/src/moment/timeline.ts:50-59`).
- Each client corrects for clock skew: it samples `serverNow − Date.now()` as each frame arrives (`apps/web/src/useRoomSocket.ts:375`), keeps the last 8 and takes the **max**, because latency only ever makes a sample smaller (`packages/ui/src/clock.ts:3-20`).
- `useMoment` schedules one timeout per beat boundary against that clock.
- The proof it works with no TV involved: the finale ceremony already runs this way on every phone, anchored on `lastResult.finishedAt` (`apps/web/src/screens/finale-timeline.ts:1-3`, `apps/web/src/screens/PhoneResults.tsx:1-2`).

### What breaks, and what it costs

**A phone a second behind.** Two different causes, and only one of them matters.

*Clock skew* is measured, not assumed, so a device whose wall clock is a second off still lands with everyone else after its first `state` frame (`clock.ts:17-20`). Not a problem.

*Frame arrival* is the real one. A phone on bad Wi-Fi gets the reveal's `state` frame late. Its beat index is computed from the absolute anchor, so it never drifts — but if it mounts more than `CUE_GRACE_MS = 600` after the current beat started, the moment is not `live` (`timeline.ts:13-14,36-44`, `moment/useMoment.ts:43-58`), and `useBeatEntries` fires no cue or haptic (`moment/useBeatEntries.ts:25-34`). `live` also gates the entrance animations (`games/imposter/src/ui/HostReveal.tsx:193,399,800`), so that phone renders past beats in their settled end state. Today that is correct: the TV carried the moment. With no TV, that player just gets the answer with no drama.

**Recommendation:** leave `CUE_GRACE_MS` at 600. A buzz three seconds late is worse than no buzz. Instead, make every stage's settled state complete and readable on its own — which reconnects already require — and accept that a badly-connected phone misses the show but never misses the result.

**A phone that reconnects mid-reveal.** Already handled by the same mechanism, and already covered: past beats render in their end state and no cue replays (`useMoment.ts:43-58`, `useBeatEntries.ts:30-31`). No change needed. Worth a new e2e that reloads one phone mid-reveal in a no-TV room.

**A kick mid-reveal.** Already handled. Each game freezes its ceremony input when the vote closes: Imposter's `revealPlayerIds` (`games/imposter/src/state.ts:80-84`), Most Likely To's `mltRevealSchema.playerIds` (`games/most-likely-to/src/state.ts:47-55`), Real or Nah's `planLies` (`games/real-or-nah/src/types.ts:63-70`). No change.

**`PHONE_FOLLOW_MS`.** It is 200ms and exists only so a phone cannot spoil the TV's beat (`games/imposter/src/ui/reveal-timeline.ts:18-19`; the rule is from `plan/0002-game-feel.md:21`). With no TV there is nothing to follow. **Proposed:** in no-TV mode the phone stages the host beats with follow 0, so the stage verdict and the player's own line land together.

## 3. Sound and haptics

**Decided: phones stay silent, haptics only.** This costs nothing to implement — it is already the behavior. `routeSurface` gives every phone route the silent engine (`apps/web/src/routes.ts:14-22`, `apps/web/src/App.tsx:87-92`), and `SILENT_ENGINE` no-ops every `play` (`packages/ui/src/audio/types.ts:68+`). Every `useCue` call in a game's UI already does nothing on a phone. Nothing breaks; the cues simply never sound.

What the games lose, walking `plan/0002-game-feel.md:171-227`:

| Cue | Carried by | Verdict on a phone |
|---|---|---|
| `scratch` per tally mark | the mark being drawn | fine, already visual |
| letter tick per flipped letter | the letter appearing | fine |
| count-roll during score count-up | the number moving | fine |
| `pop` on a vote arriving | the avatar popping in | fine |
| `slam` / `buzzer` / `boing` at the verdict | the stamp slamming in | mostly fine — but see below |
| **`drumroll`** | **nothing** | **needs a visual substitute** |
| `jingle-start`, crown `fanfare` | the title card, the crown drop | fine, `PhoneResults.tsx` already does this |

Two things need work:

**The drumroll is pure audio and it is load-bearing.** It covers 5.5s→8.0s of the Imposter reveal (`plan/0002:176`), 0.0s→3.5s of the caught result (`:193`), and 3s of the crown intro (`apps/web/src/screens/finale-timeline.ts:17`). On a silent phone those seconds are a screen that has stopped moving, which reads as a bug. **Proposed:** one shared `Suspense` element in `packages/ui/src/fx/`, driven by the same beat, plus `useHeartbeat` at the `fast` tempo (`packages/ui/src/haptics.ts:78-95`) — the phone's existing tension device. Dim, a tightening ring or three filling dots, and the heartbeat buzz.

**The verdict has neither sound nor buzz on iPhone.** `canVibrate()` is `"vibrate" in navigator` (`haptics.ts:29-31`) and iOS Safari has no Vibration API. The existing answer is `pulse()`, a WAAPI scale flash (`haptics.ts:44-63`). **Proposed:** every verdict beat in no-TV mode must have a visible change large enough to read with no buzz and no sound — a slam plus a colour-independent stamp, per the "never colour alone" rule (`CLAUDE.md:37`, `design/AVATARS.md:45`).

**Proposed:** do the cue-to-visual table that `plan/0002:306` still owes, as part of this work. It was optional when the TV carried the sound. With no TV it is the whole feedback channel.

The kit's sound chip stays on TV routes only (`packages/ui/src/chrome.tsx:103-121`, only mounted by `TvHeader` at `:143-158`), so a no-TV phone shows no sound control at all. That is right: there is nothing to unmute.

## 4. Secrecy

### The rule

> **In a no-TV room, a player's view carries exactly two things: that player's own view, and the host view unchanged. Nothing is composed in between.**

The host view is already, by definition, what everyone in the room may see — that is what a TV is. So sending it to every phone is not a new disclosure; it is the same disclosure to the same people through a different pane of glass. The invariant is mechanical rather than a judgement call, because `stage` is literally `def.hostView(state, ctx)` (`room.ts:1169-1170`). A game that wants something on the stage must put it on the host view, where the existing review rule already applies (`packages/sdk/src/types.ts:144-146`, `CLAUDE.md:35`, `CONTRIBUTING.md:26`).

**Proposed test, one per game:** for a table of states covering every phase, assert `playerView(state, id).stage` deep-equals `hostView(state)`. It cannot drift.

### What the games currently rely on the TV for

*Content everyone is meant to see at the same time* — a ballot, a tally, a reveal. Verified that this is the bulk of what the host view carries and that the player view is missing it:

| Game | On the host view, not the player view |
|---|---|
| Most Likely To | `votedIds` (`state.ts:88-101` vs `:106-120`) — the whole `reveal` object is already on both |
| Imposter | `playerIds`, `doneSpeakerIds`, `votedIds`, `tally`, `revealPlayerIds`, `decoyWord` at reveal, `pointsThisWord`, `guessLength` (`state.ts:117-141` vs `:146-174`) |
| *Real or Nah* | *`submittedIds`, `votedIds` (`types.ts:151-166` vs `:170-188`) — the whole `reveal` object is already on both. Not in scope, recorded for later* |

All of it is public on the TV today, at the same moment. The `stage` field delivers exactly this set and nothing more.

One behaviour change worth naming: today a phone learns *how many* people have voted (`votedCount`) and in no-TV mode it will learn *who*. That is already on the TV, so it is not a leak — but it is different, and reviewers should not be surprised by it.

*Content that was safe only because it was far away.* I looked for this and **found none on the wire.** Nothing in a host view is safe because of distance; each field is gated by phase in `views.ts`, not by geography. The direction of the risk actually reverses: no-TV mode is safer for wire secrets than TV mode, because a phone is private and a TV is not.

The new risk is physical, and it is real: **a phone now holds the stage and its owner's secret at once**, so people will lean over to see the stage and read the secret on the way. Imposter's `word-check` is the sharp case, since the crew word is on every crew phone.

**Proposed rule, enforced per phase:** in no-TV mode a phase shows the stage *or* the player's secret, never both at the same time. Imposter's word-check shows only the card and an empty stage; the mitigation already exists, because the card starts face down and needs a deliberate hold-to-peek (`e2e/browser/imposter.ts:31-36`). Nothing about no-TV mode should ever suggest holding a phone up for someone else.

Devtools remain what `plan/0002:317` already accepted: phones receive reveal data seconds early, which is fine for a party game because the room makes it public anyway. `stage` extends that from the personal result to the whole stage. Same acceptance, stated again.

## 5. Room lifecycle with no host screen

### Who creates the room

**Verified gap:** a phone cannot create a room today. `RouteView` sends any narrow touch device at `/` straight to the join form (`apps/web/src/App.tsx:24-31,61`), and the "Start a room" button only exists on `TvLanding` (`apps/web/src/screens/TvLanding.tsx:210-247`). There is no other entry point.

**Proposed:** the phone landing gets two buttons, "Start a room" and "Join a room". "Start a room" calls the same `POST /api/rooms` (`apps/web/src/api.ts:64-70`, `apps/worker/src/routes.ts:115-128`) — unchanged, including the daily cap and the rate limiter. The returned `hostToken` is still stored under `opg:host:<CODE>` exactly as the TV does (`TvLanding.tsx:220-228`), then the starter is sent to `/<CODE>` to join as a player instead of to `/host/<CODE>`.

The starter is therefore just the first player, which makes them the VIP under the existing rule (`room.ts:306-315`). **The VIP rule stays exactly as it is.** No special "owner" concept, no new caller kind.

The stored host token is the escape hatch: if a laptop turns up later, the starter's phone can still open `/host/<CODE>` and the room becomes a TV room (§7).

### Room mode

The room has to know which mode it is in, because `stage` and the game picker both depend on it.

**Rejected:** deriving it from `hostConnected`. That flag flips false for a moment whenever the TV reloads (`apps/worker/src/room-hub.ts:200-213`), and flipping which games are playable on a transient socket state is a bug generator.

**Proposed:** an explicit room mode, set at creation, persisted in the snapshot, exposed as `RoomViewBase.sharedScreen: boolean`. `POST /api/rooms` from the TV landing sets it true (today's behaviour, unchanged); the phone create flow sets it false. The VIP can flip it in the lobby and never during a game.

### Sharing the code

**Decided: people read the code aloud.** No share sheet, no QR on the starter's phone. That is the right call for a room where everyone is sitting together, and it removes the awkward "point your phone at my phone" moment.

> **Reversed after the mode shipped (§10.18).** The starter's phone now carries a QR of the join URL, and tapping it opens the share sheet. Reading the code aloud still works and is still what the screen leads with; it is simply no longer the only way in.

**Verified gap:** the room code is barely visible on a phone today.

- Phone lobby: small footer text, "Room XXXX" (`apps/web/src/screens/PhoneLobby.tsx:261`).
- VIP controls: small footer text, "Room XXXX · N players" (`apps/web/src/screens/PhoneVipControls.tsx:489`).
- **In game: nowhere.** `PhoneStrip` carries the game name, progress and the timer only (`packages/ui/src/chrome.tsx:249-279`). The code is in the URL (`/<CODE>`, `apps/web/src/routes.ts:47`) but a phone browser hides the address bar during play.

**Proposed:**

1. **Lobby, starter's phone:** the code is the hero. Big marker type, spelled out (`B · K · T · Z`) so it is read aloud correctly, with "Say this out loud" under it. It stays the largest thing on the screen until the game starts. This replaces the TV's `JoinPanel` (`apps/web/src/screens/TvLobby.tsx:115-147`) as the only place the code lives, so it has to carry that weight alone.
2. **Lobby, everyone else:** the existing footer chip grows to a readable "Room BKTZ" line, so any player can read it out when a straggler asks.
3. **In game:** `PhoneStrip` gains an optional room-code slot, shown in no-TV rooms. It is small, but it means someone whose phone died can always be told the code by any player, without pausing the game. **This is the rejoin path**, and it needs to be reachable at every moment, because in no-TV mode there is no screen in the corner of the room holding it.

### What a mishear gets

**Verified, and it already behaves well.** `PhoneJoin` prechecks with `GET /api/rooms/:code` before opening any socket (`apps/web/src/screens/PhoneJoin.tsx:229-243`), and a room that does not exist gives "That room code doesn't exist." (`:210`, `:223-227`). The input strips anything that is not A–Z, uppercases and caps at 4 (`:259-266`). The worker 404s a code that fails `ROOM_CODE_RE` without ever waking a Durable Object (`apps/worker/src/routes.ts:174-175`). So a mistyped code is a clear one-line error on the join form, not a hung socket.

Two things to fix, both small:

- **The alphabet was chosen so codes cannot spell words, not so they are easy to hear.** `ROOM_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ"` (`packages/protocol/src/index.ts:27-28`) contains B, C, D, G, P, T, V and Z — the entire "-ee" rhyming set — plus M/N and S/F. Across a noisy room this will be the most common failure in no-TV mode. **Recommendation: do not change the alphabet** (it is in URLs, in the protocol regex at `:30` and in every e2e assertion). Instead, spell the code out on the starter's phone with generous letter-spacing, and add a single hint line to the join error: "Sounds alike: B/D/P/T/V/Z, M/N, S/F. Ask them to say it again."
- **The rate limiter gives the wrong message.** Repeated wrong guesses hit `deps.limiters.join` (`routes.ts:171`), which returns `rate-limited`; `joinError` only special-cases `not-found`, so everything else falls through to "Could not reach the room. Check your connection." (`PhoneJoin.tsx:212,238-242`). With no TV, more people will mistype. Give `rate-limited` its own copy: "Too many tries. Wait a moment and try again."

### Host presence, idle cleanup and reconnection

- **Host presence:** unchanged. In a no-TV room `hostConnected` is simply never set true, and it is not in any view anyway (`room.ts:562-565`).
- **Idle cleanup:** unchanged, two hours with no connection and no running game (`room-hub.ts:26`, `room.ts:636-641`). One behavioural difference to note: today the TV socket keeps the room "connected" even when every phone locks. With no TV, everyone locking their phones makes the room look empty. It still cannot be swept mid-game (`room.ts:638` requires the lobby phase), and two hours is long, so **no change** — but it is the reason the wake lock matters more here. `useScreenWakeLock` already runs on a phone once joined (`apps/web/src/screens/PlayerApp.tsx:343`, `packages/ui/src/screen.ts:91-96`).
- **Reconnection:** unchanged. Phones already rejoin by token from `localStorage` (`room.ts:672-690`, `useRoomSocket.ts:106-124`). A phone that lost its storage rejoins by typing the code and name again, which is why §5's in-game code slot exists.

## 6. Per-game work

### Most Likely To — opts in. The cheap one

Two phases, and the player view already carries the entire reveal: `mltRevealSchema` holds the roster, the full `tally`, the outcome and the matched voters, and it is on both views (`games/most-likely-to/src/state.ts:47-55`, `:99` and `:118`). The only data gap is `votedIds` during the vote (`:96` vs `:114`), which `stage` supplies. Smallest TV surface of the three (~928 lines).

What it needs:

- `ui/stage/Vote.tsx` — the prompt at phone heading size, and who has voted. The prompt is already on the player view (`state.ts:110`), so this is layout only.
- `ui/stage/Reveal.tsx` — the 12s ceremony (`REVEAL_MS`, `state.ts:10`) repainted at phone scale, reusing `ui/reveal-timeline.ts` unchanged.
- `noTv: true` in `src/index.ts`, plus no-TV preview fixtures.

What it loses: the round's joy is the room reacting to the tally on one screen at one instant. Per-device staging keeps the instant (same anchor, §2) but loses the single screen everyone is looking at. Acceptable — the haptic lands on every phone at the same moment, which is itself a cue to look up.

It is also the game `ROADMAP.md:45` calls "the template to copy for your first game", so the stage pattern that lands here is what every future contributor copies. That is the second reason to do it first.

### Imposter — opts in. The interesting one

The game is played out loud around a table, so the shared screen matters least here: it was a scoreboard and a ceremony, never a game surface. Nobody needs to look at anything to give a clue. That makes it the game most worth having in no-TV mode, and the most work to get there.

Two things live on the TV today and have to work on every phone.

**The clue order.** The TV is where you check whose turn it is and who has already spoken. The player view already carries `clueOrder`, `currentSpeakerId`, `isMyTurn` and `nextSpeakerId` (`games/imposter/src/state.ts:154-157`); `doneSpeakerIds` (`:122`) arrives with `stage`. So the data is all there — this is purely a phone-scale layout: a single row of avatars, the current speaker marked, the spoken ones struck through. It should be small and permanent, because during the clue phase everyone is talking and only glancing down.

**The 12-second reveal.** `ui/HostReveal.tsx` is 808 lines and is the single largest piece of work in this plan. It reuses `ui/reveal-timeline.ts` unchanged — `hostRevealBeats` (`:58-81`), `scratchOrder` (`:27-43`), `marksDrawn` (`:84`) are all pure and phone-ready — with `PHONE_FOLLOW_MS` at 0 (§2). What has to be redrawn is the tally board: on the TV it is a wide grid of player tiles with marks scratched in round-robin. At 390px it has to become a vertical list, and the spotlight sweep at 5.5s has to become something that works in one column.

The rest:

- **word-check** shows the card and an empty stage (§4). The card is already face-down with hold-to-peek (`e2e/browser/imposter.ts:31-36`), which is exactly the mechanic this mode needs.
- **last-chance** is the one moment whose entire tension was audio: a draining timer, blank tiles and a drumroll (`plan/0002:183-186`, `ui/HostLastChance.tsx`). On silent phones that is fifteen seconds of a screen that stopped moving. It needs the §3 `Suspense` element or it reads as a bug. The imposter's `typing` action already sends length only (`views.ts:29-33`), so the blank tiles work unchanged.
- **result** (`ui/HostResult.tsx`, 823 lines) is the letter-by-letter guess flip, the verdict slam and the standings count-up, all driven by `ui/result-timeline.ts`, which is already pure.

### Real or Nah — stays TV-only, for now

Its reveal is a long shared moment played lie by lie: each card slides in, the fooled players' avatars pop on, the card flips to name the author, then the truth lands last, running 11.5–30s depending on how many lies fooled anyone (`plan/0002:204-212`, `games/real-or-nah/src/reveal-plan.ts`). That is the game's whole payoff, and it is built as a sequence of things the room watches together and reacts to out loud — "who wrote *that*?" — which is exactly what per-device staging weakens most. The vote phase has the same problem in smaller form: the options are read off the TV together today (`ronHostViewSchema.options`, `types.ts:161`), and on phones that becomes everyone reading silently.

What it would take later, recorded so the decision is not lost: the data is nearly free — the whole `reveal` object is already on the player view in the same shape as the host's (`types.ts:186` vs `:163`), so only `submittedIds` and `votedIds` (`:157-158`) are new, and `stage` supplies both. The work is entirely presentational (`ui/Host.tsx` 448 + `ui/HostReveal.tsx` 553) plus one open design question: whether the vote phase needs longer than its current 30s (`types.ts:9`) when nobody reads the options aloud. Revisit after the other two games have been played without a TV.

### Doodle Bluff

Its whole point is showing one player's drawing to the room (`ROADMAP.md:53`), so in no-TV mode the drawing has to reach every phone as stage payload — an image on the wire, an order of magnitude larger than any stage this plan sizes for — which is why it should declare `noTv` only after that payload is measured. (I did not read `plan/0003-doodle-bluff.md`; it is being written in parallel.)

## 7. How a game declares support

**Proposed: one flag, in one place.**

```ts
// packages/sdk/src/types.ts, on GameDefinition (currently :123-153)
/** True when the game plays with no shared screen. Default false: no-TV support is opt-in. */
noTv?: boolean;
```

Optional and defaulting to false is exactly "opt-in": a game that says nothing does not claim support, and no existing game or contributor template breaks.

The UI side needs no second declaration. `GameUi.Phone` gains one prop:

```ts
// packages/ui/src/game-ui.ts, on GameUi.Phone (currently :23-31)
/** The host view in a no-TV room, or null in a room with a shared screen. */
stage: HostView | null;
```

`stage !== null` *is* the no-TV flag, so there is nothing for the two packages to disagree about. The registry parses it with the game's own `hostViewSchema`, which it already imports (`apps/web/src/games.tsx:3-13,98-124`).

The one remaining drift risk is a game setting `noTv: true` and shipping a `Phone` that ignores `stage`. **Proposed:** a registry test — every game whose definition sets `noTv` must render something for `stage` in every phase — sitting next to the UI tests each game already owes (`CONTRIBUTING.md:29-33`).

### How the platform picks the surface

`GameSummary` (`packages/protocol/src/index.ts:63-70`) gains `noTv: boolean`, filled in `roomBase` (`room.ts:1109-1116`). Combined with `RoomViewBase.sharedScreen` from §5, every client knows which games are startable without asking.

### The flow for a game that cannot be started

With two of three games opting in, this is a real screen people will hit on their first no-TV night: Real or Nah sits in the picker and cannot be started. It has to explain itself without anyone having to guess.

**Show it, disabled, with a reason. Do not hide it.** A hidden game reads as a bug ("where did Real or Nah go? I played it last week"), and a hidden game cannot say why. The kit already has the pattern — a disabled control carries a text label saying why (`design/AVATARS.md:43`) — and the VIP picker already computes a `disabledReason` for the too-few-players case (`apps/web/src/screens/PhoneVipControls.tsx:45-46,383-391,468`).

**What the VIP sees.** The game tile stays in the list, in its usual position, dimmed at the standard 0.45 (`AVATARS.md:43`), with a line under the player count reading "Plays on a shared screen." Tapping it still selects it — `pick-game` only checks that the game exists (`room.ts:765-783`) — so the VIP can look at it and read the reason rather than tapping a dead tile. With it selected, the start button is disabled and the existing `startDisabledReason` slot (`PhoneVipControls.tsx:45-46,468`) reads "Real or Nah plays on a shared screen. Turn that on to start it." Under it, the mode toggle from §5.

**What the other phones see.** This is the gap. Today a non-VIP lobby shows a sticky note saying "*Name* is the VIP and picks the game. **Watch the TV.**" (`apps/web/src/screens/PhoneLobby.tsx:171-175`) and nothing else — the game list is not on a non-VIP phone at all, because the TV was carrying it. With no TV there is nothing to watch, so a non-VIP player staring at a stalled lobby has no idea what is happening.

**Proposed:** in a no-TV room the non-VIP lobby shows the selected game — name, blurb, player range — and, when it cannot be started, the same reason in the same words: "Plays on a shared screen." Everyone reads the same sentence at the same time, so the conversation is "we need a laptop", not "why isn't it starting". This is a small screen but it is the one that decides whether the mode feels finished.

**If the VIP starts it anyway**, `start-game` refuses. **Proposed: reuse `invalid-action` with a clear message, do not add an `ErrorCode`.** `useRoomSocket` parses server frames with a closed zod enum of error codes and returns `null` for anything else (`apps/web/src/useRoomSocket.ts:52-67,101-103`), so a client running older code would silently *drop* an error frame carrying a new code and show nothing at all. `invalid-action` already falls back to the server's own message (`apps/web/src/screens/PlayerApp.tsx:64-77`), so "This game plays on a shared screen." renders everywhere. The refusal should never be the first time anyone hears it; the picker said it already.

**The escape hatch**, and it belongs in the copy rather than in a help page: the VIP flips the room to shared-screen mode in the lobby, and the starter's phone still holds the host token in `localStorage`, so `/host/<CODE>` opens on any laptop that turns up. "We want Real or Nah and we have no TV" is one tap plus one laptop, not a dead end.

### Support removed while a room is open

Games are code, and a deploy restarts every Durable Object (`CLAUDE.md:50`). So a game's `noTv` flag can change under a live room.

- The picker fixes itself: `GameSummary` is rebuilt on every view (`room.ts:1109-1116`), so the next broadcast shows the game disabled.
- A game **already running** in a no-TV room keeps running. The stage payload is `def.hostView(...)`, which still exists whatever the flag says, so nothing is missing.

**Recommendation: do not end a running game.** Let it finish and let the picker refuse the next start. Killing a live game on deploy is a much worse outcome than a few minutes of inconsistency, and it contradicts "Running games are never cut off" (`intent/0001-platform-mvp.md:74`).

## 8. Impact map

| Package / file | Change |
|---|---|
| `packages/protocol/src/index.ts` | `ActiveGameView.stage`; `GameSummary.noTv`; `RoomViewBase.sharedScreen` |
| `packages/sdk/src/types.ts` | `GameDefinition.noTv?`; `CreateRoomOptions` gains the room mode; `RoomCore` doc update |
| `packages/sdk/src/room.ts` | `InternalState`/`blankState`/snapshot gain `sharedScreen` (optional, normalized on restore per `room.ts:1243-1247`); `activeGame` (`:1159-1175`) fills `stage`; `roomBase` (`:1101-1122`) fills `sharedScreen` and `noTv`; `onStartGame` (`:890-925`) refuses a TV-only game; a VIP message to flip the mode in the lobby |
| `packages/sdk/src/testing.ts` | bot playthroughs gain a no-TV variant |
| `packages/ui/src/game-ui.ts` | `GameUi.Phone` gains `stage` |
| `packages/ui/src/chrome.tsx` | `PhoneStrip` (`:249-279`) gains the room-code slot |
| `packages/ui/src/fx/` | new shared `Suspense` element (§3) |
| `packages/ui/src/moment/EyesOnTv.tsx` | copy and the TV doodle are wrong with no TV; needs a no-TV variant |
| `apps/worker/src/routes.ts` | `POST /api/rooms` accepts the room mode |
| `apps/web/src/App.tsx`, `routes.ts` | a phone landing route with "Start a room"; `routeSurface` (`routes.ts:14-22`) unchanged — phones stay silent |
| `apps/web/src/screens/TvLanding.tsx` | unchanged behaviour; the create call grows the mode argument |
| new `apps/web/src/screens/PhoneLanding.tsx` | start-or-join |
| `apps/web/src/screens/PhoneLobby.tsx` | hero room code for the starter, readable code chip for everyone; the non-VIP lobby shows the selected game and its blocked reason (`:171-175` currently says "Watch the TV") |
| `apps/web/src/screens/PhoneVipControls.tsx` | "Plays on a shared screen." on the tile and on the start button; the mode toggle |
| `apps/web/src/screens/PhoneJoin.tsx` | `rate-limited` copy; the sounds-alike hint |
| `apps/web/src/screens/PlayerApp.tsx` | passes `stage` through to `Ui.Phone` |
| `apps/web/src/screens/PhoneWaiting.tsx:28`, `PhoneLobby.tsx:174`, `PhoneJoin.tsx:144`, `PhoneResults.tsx:315` | four copy strings that name the TV |
| `games/most-likely-to/src/index.ts`, `games/imposter/src/index.ts` | `noTv: true`. Real or Nah declares nothing and stays TV-only |
| `games/most-likely-to/src/ui/`, `games/imposter/src/ui/` | `Phone.tsx` plus new `ui/stage/*.tsx` sections (§1, §6) |
| `games/{most-likely-to,imposter}/src/ui/preview.ts` | no-TV fixtures for `/dev/moments` |
| `apps/web/src/dev/MomentPlayer.tsx` | a no-TV column beside the TV and phone columns |
| `e2e/browser/harness.ts` | `startRoomFromPhone`; `startRoom` (`:19-27`) currently always begins on a desktop TV page |
| new `e2e/browser/no-tv.spec.ts` | three phone contexts, no TV page at all |
| `design/` | new `PhoneNoTv*.dc.html` mockups per game phase; `AVATARS.md` phone type scale already covers it (`:24`) |
| `README.md`, `CONTRIBUTING.md`, `CLAUDE.md:3`, `ROADMAP.md` | the premise line and the `noTv` capability |

## 9. Build slices

Ordering principle: the platform lands first and is independently verifiable **with zero games supporting no-TV mode**, then the games are retrofitted cheapest and clearest first, so the pattern is proven on the small game before the large one copies it.

### Slice 0: record the plan
This file.

### Slice 1: a room with no TV, before any game supports it
Room mode, phone create flow, the room code on a phone, the copy sweep. No game changes.

- `sharedScreen` in the protocol, RoomCore, snapshot and restore normalizer.
- `POST /api/rooms` takes the mode; `PhoneLanding` with start-or-join; the starter stores the host token as today.
- Hero room code in the phone lobby; readable code chip for every player; `PhoneStrip` room-code slot.
- `rate-limited` join copy; the sounds-alike hint.
- The four TV copy strings, and a no-TV `EyesOnTv` variant.

**Done when:** a room can be created from a phone, three more phones join by a code read aloud, the picker says every game needs a TV, and the room is otherwise indistinguishable from today. A mistyped code gives the right message. `pnpm check` and the existing TV e2e both pass unchanged.

### Slice 2: the stage payload and the surface
No game renders a stage yet.

- `ActiveGameView.stage`, `GameDefinition.noTv`, `GameSummary.noTv`.
- `RoomCore.activeGame` fills `stage`; `onStartGame` refuses a TV-only game with `invalid-action`.
- `GameUi.Phone` gains `stage`; the registry parses it with `hostViewSchema`; `PlayerApp` plumbs it.
- `PhoneVipControls` disabled reason; the lobby mode toggle.

**Done when:** in a no-TV room a player's `stage` deep-equals `hostView(state)` for every phase of every game, and is null in a shared-screen room. Starting a TV-only game is refused with readable copy. Measure the in-game frame size with `stage` attached, on Imposter's reveal (the largest host view), and record it.

### Slice 3: Most Likely To
**First because it is the cheapest and the clearest.** Two phases, the whole reveal is already on the player view (`games/most-likely-to/src/state.ts:118`), the smallest TV surface (~928 lines), and it is the template other contributors copy (`ROADMAP.md:45`). The stage pattern gets settled here, on the game where a mistake is cheapest to redo — and then Imposter copies it rather than inventing it at four times the size.

**Sequencing note:** Most Likely To is not on `main`; it is PR #5. Land that first. If it stalls, the honest fallback is to do Imposter's clue-order stage alone as slice 3a and hold the reveal until the pattern is settled somewhere — not to make the 808-line reveal the place where the pattern gets invented.

- `ui/stage/Vote.tsx`, `ui/stage/Reveal.tsx`; `noTv: true`; preview fixtures.
- The shared `Suspense` element (§3), first used by the reveal.

**Done when:** a full 3-phone and 8-phone no-TV game, bot playthroughs pass, and the reveal reads with no sound on an iPhone.

### Slice 4: Imposter
**Second, and the bulk of the work.** Six phases, ~2,475 lines of TV presentation, the only per-phase secrecy rule, and the only moment whose tension was entirely a drumroll. It goes after Most Likely To so the stage pattern and the `Suspense` element are already proven.

- `ui/stage/Clues.tsx` first — it is small, it is pure layout over data the player view already has (`games/imposter/src/state.ts:154-157`), and it is the piece the game actually needs during play.
- `ui/stage/WordCheck.tsx` — empty stage, card only (§4).
- `ui/stage/Vote.tsx` — who has voted, never whom.
- `ui/stage/Reveal.tsx` — the 12s ceremony, `hostRevealBeats` with follow 0. The single largest piece.
- `ui/stage/LastChance.tsx` — blank tiles from `guessLength`, plus `Suspense`.
- `ui/stage/Result.tsx` — letter flip, verdict, standings, from `result-timeline.ts`.

**Done when:** no crew word ever appears in the stage region in any phase, a full no-TV game at 3 and 8 players, the reveal reads silently, and last-chance does not read as a frozen screen.

### Slice 5: the silent-feedback pass
The cue-to-visual table `plan/0002:306` still owes, done for real: every beat with a cue and no motion of its own gets a named phone visual. Reduced-motion pass per moment. iPhone pass with no vibration. Screen-reader pass on the stage regions.

### Verification checklist, every slice

1. `pnpm check` — packs validate, Oxlint 0 problems, every `typecheck` exits 0, all Vitest pass, `crap-typescript` reports no failures, Vite prints `built in`.
2. **Bot playthroughs** at 3 and 8 players with a disconnect and rejoin, in both room modes. `runBotPlaythrough` drives `playerView` and `bot()`, and `stage` is additive, so bots are unaffected — assert that rather than assume it.
3. **API e2e** (`pnpm e2e:api`) — a room created in no-TV mode, no `host-hello` ever sent, a full game.
4. **Browser e2e** — the existing TV specs unchanged, plus `no-tv.spec.ts` with three phone contexts and no TV page; one phone reloads mid-reveal.
5. **Manual, `pnpm dev`:** a TV pass at 1920×1080 proving nothing regressed, then no-TV passes at 390px and 430px wide, portrait, on a real iPhone (no vibration) and a real Android (vibration). Compare each phase against its design file.
6. **Secrecy:** the per-game `stage === hostView` table test, plus a manual read of every no-TV phase asking "could the person next to me learn something from this screen".

## 10. Decisions

Settled with the maintainer on 2026-09-18. Every recommendation in the draft was accepted; the reasoning that led to each is kept because it is the reason the decision holds.

**1. Explicit room mode versus deriving it from host presence.**
**Decided:** Explicit, set at creation, VIP-flippable in the lobby, frozen during a game. Deriving from `hostConnected` flips on every TV reload (`room-hub.ts:200-213`).

**2. `stage = hostView` versus per-game player-view fields.**
**Decided:** `stage = hostView`. It is one wire field instead of three schema changes, and the secrecy invariant becomes mechanical rather than a review judgement.

**3. Payload size.** `stage` roughly doubles the in-game frame. Rooms cap at 9 sockets (`plan/0001:20`) and the host views here are a few hundred bytes, so this should be fine — but it was unmeasured.
**Decided and now measured.** Imposter's reveal at 8 players, the largest host view in the product, one player frame: **572 bytes without `stage`, 1,215 bytes with it — a delta of 643 bytes.** So the estimate held: `stage` costs 2.1x, and the absolute number is small enough that it does not change any conclusion in this plan. At the 8-socket worst case that is ~5 KB more per broadcast across the whole room. `apps/worker/src/stage-payload.test.ts` keeps the measurement honest, asserting ranges rather than exact byte counts so incidental view-shape drift does not fail the build while a real regression still would. The caveat stands: **any future game whose host view carries an image must not simply inherit `stage`** — Doodle Bluff is the first such game and [plan/0003-doodle-bluff.md](0003-doodle-bluff.md) sizes its own payload separately.

**4. New `ErrorCode` versus reusing `invalid-action`.**
**Decided:** Reuse `invalid-action`. An added code is *invisible* to an older client, which drops the whole frame (`useRoomSocket.ts:52-67,101-103`).

**5. Hidden versus disabled in the picker.**
**Decided:** Disabled with "Plays on a shared screen." A hidden game looks broken and cannot explain itself. See §10.17 for why the copy names what the game needs rather than what the room lacks.

**6. The grace window for a late phone.**
**Decided:** Leave `CUE_GRACE_MS` at 600. A late buzz is worse than none. Make settled states complete instead.

**7. `PHONE_FOLLOW_MS` in no-TV mode.**
**Decided:** 0. It exists only to avoid spoiling a TV that is not there.

**8. Minimum players.**
**Decided:** Unchanged at 3 (`packages/protocol/src/index.ts:32-33`). No-TV mode removes a device, not a seat. Worth stating so nobody assumes it enables two-player rooms.

**9. Room-code audibility.** The alphabet was chosen so codes cannot spell words, not so they survive a noisy room (`protocol:27-28`).
**Decided:** Do not change the alphabet; it is in URLs, in `ROOM_CODE_RE` (`:30`) and in every e2e assertion. Spell it out visually and add the sounds-alike hint. Revisit only if playtests show repeated failures.

**10. Can a no-TV room gain a TV mid-session?**
**Decided:** Yes, in the lobby only, using the host token the starter's phone already holds. Never mid-game.

**11. Daily room cap.** Creating a room gets easier, so more rooms get created. The cap is 150 (`apps/worker/src/routes.ts:11`) and the cost model assumed TV-hosted sessions (`intent/0001-platform-mvp.md:151`).
**Decided:** No change now. Watch the counter for the first weeks and retune, exactly as the intent already plans to.

**12. Two of three games supported is a worse first impression than all three.**
**Decided:** Accept it, and make the blocked-game flow good (§7) rather than hiding the game. Someone whose group plays Real or Nah every week will meet that screen on their first no-TV night, and what they read there decides whether the mode feels unfinished or deliberate. Revisit Real or Nah once the other two have been played without a TV.

**13. Imposter is the game most worth having here and the most work.**
**Decided:** Keep it second, after the pattern is proven on Most Likely To. The temptation will be to start with Imposter because it is the one people want without a TV. Its reveal is 808 lines and its last-chance phase is the hardest silent moment in the product; inventing the stage pattern there would be the expensive way to learn it.

**14. Does the room feel dead with everyone looking down?**
**Decided:** The real risk of the whole mode, and no amount of engineering answers it. The mitigation is that haptics land on every phone at the same instant, which is a cue to look *up*. Playtest slice 3 with real people before committing to slice 4.

**15. Design artboards before UI code.**
**Decided:** Every no-TV screen gets a `design/PhoneNoTv*.dc.html` artboard, approved, before the component is written. This is not the usual order in this repo, and it is deliberate: §1 establishes that nothing scales down from 1920×1080, so every stage region is new artwork rather than a re-layout. Twelve artboards — four platform screens, two for Most Likely To, six for Imposter — registered on a new `no-tv` page in `design/canvas.json`. The stage-versus-controls division is settled on the Most Likely To vote screen and copied from there, for the same reason slice 3 comes before slice 4.

**16. The silent-feedback pass is in scope, not a follow-up.**
**Decided:** Slice 5 ships with the mode. The cue-to-visual table `plan/0002-game-feel.md:306` still owes is written for real, and the shared `Suspense` element lands in `packages/ui/src/fx/` as part of slice 3 rather than slice 5, because Most Likely To's reveal and Imposter's last-chance both need it before slice 5 would arrive. The reasoning is §3: with no TV the visuals are the whole feedback channel, so a drumroll with no visual substitute is not a polish item, it is a phase that reads as a frozen screen. The real-iPhone pass — no Vibration API, so no sound and no buzz — stays a manual step for the maintainer.

**17. Never name this mode by what is missing.**
**Decided:** No player-visible copy says "no TV", "TV-only", "needs a TV" or any other phrasing that defines a room by the screen it does not have. Both ways of playing are first class and the product supports both, so copy that frames one as an absence reads as a limitation being apologised for — and it is the phones-only room, the one with the least reassurance already, that pays for it.

The rule: **name what a thing is or needs, never what the room lacks.** So a game that cannot run without a shared screen reads "Plays on a shared screen." rather than "Needs a TV screen."; the lobby control is "Add a shared screen" rather than "Use a TV"; and the room chrome carries no mode badge at all, because the presence of the control already says which mode the room is in. Where a TV genuinely is an option worth offering, it is offered as one — "Playing with a TV or laptop? Open this page there for the big screen." — rather than as a thing the room is missing.

`sharedScreen` and `noTv` stay as they are in code. This decision is about player-visible copy, not identifiers.

**18. The starter's phone carries a QR and a share link after all.**
**Decided, reversing the "joining" row in the decisions table and §5.** The original call — code read aloud, no QR, no share sheet — was made to avoid the awkward "point your phone at my phone" moment, and that reasoning still holds for a room sitting together. What it did not weigh heavily enough is §10.9's own finding: the alphabet was chosen so codes cannot spell words, **not** so they survive being heard across a noisy room, and it carries the whole B/D/P/T/V/Z rhyming set plus M/N and S/F. Reading four consonants aloud was the single point of failure for getting into a room, and the mitigation shipped for it — spelling the code out, plus a sounds-alike hint on the join error — helps the person who mishears but does nothing for the person who cannot hear at all.

So the room-code hero now carries a QR of the join URL, and **tapping it opens the share sheet**, falling back to copying the link where there is no share API. The code is still the hero and still the thing the screen leads with. This also quietly serves a case the mode never addressed: someone joining from the next room, or a player who is not in earshot.

**This supersedes the assumption in [plan/0003-doodle-bluff.md](0003-doodle-bluff.md)'s no-TV section**, which states that no invite link or QR exists in a no-TV room and that Doodle Bluff adds no dependency on either. The second half stays true — Doodle Bluff still surfaces neither — but the first half is now wrong, and that document should be corrected when the game lands.
