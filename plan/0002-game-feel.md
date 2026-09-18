# Plan: Game feel (staged reveals, sound, haptics, awards, finale)

Author: Asaf Shitrit. Status: slices 0–5 built and verified (unit, CRAP, API and browser e2e); slice 6 audits and the playtest sign-off (including the TV delay decision) are still open.
Inputs: [plan/0001-platform-mvp.md](0001-platform-mvp.md), [intent/0001-platform-mvp.md](../intent/0001-platform-mvp.md) (bouncy motion, reveals, music and SFX with credits, reduced motion).

## Context

Right now the games feel flat. Motion is two CSS keyframes: a 300ms fade-up on phase change and a timer pulse in the last 5s. There is no audio (the mute chip only saves a flag), no haptics, no confetti, no score count-up or reordering, and room screens swap with no transition.

Every reveal arrives as one full view and renders all at once:
- The "IMPOSTER!" stamp is visible from the first frame.
- Real or Nah shows every lie at once.
- Phones show the result at the same instant as the TV, which spoils the TV moment.
- The final scoreboard appears instantly, and phones have no results screen at all.

The intent doc already promised "bouncy motion", reveals, music and sound effects with mute and credits, reduced motion, and "the imposter comeback is a great TV moment". This plan builds that. Tension builds on the TV, peaks are loud (a slam, a small shake, a drumroll, confetti), phones follow the TV with buzzes and personal celebrations, and end-of-game awards plus a crown ceremony close each game.

### Decisions made with the user
| Topic | Decision |
|---|---|
| Phones during reveals | TV first, phone follows. Teaser plus heartbeat buzz; the personal result lands on the TV's big beat, synced by the server clock |
| Sound | CC0 sample files (Kenney) plus Web Audio synth (ticks, heartbeat, drumroll). **TV only; phones make no sound** |
| Dependencies | None new. CSS, the Web Animations API, and a hand-rolled canvas confetti in the doodle style |
| Scope | Presentation plus end-of-game awards and mid-game callouts. No other rule changes |
| Pacing | Reveals get longer; VIP Skip still works. Imposter reveal 7s → 12s; Real or Nah reveals one lie at a time, capped at 30s |
| Tone | Cartoon game show: quiet between moments, loud at peaks |
| Phone extras | Haptic buzzes (always with a visual pulse), personal celebrations and a results/crown screen, a role card flip at word-check |
| Music | Lobby loop plus stingers (start, slam, crown), and a tension bed during votes and last chance |
| Last chance | Live blank tiles (length only) while the imposter types, then on submit a drumroll, letter-by-letter flip and a GOT IT/NOPE slam |
| Finale | Awards then crown (~25s); the VIP can start the next game at any time |
| Rollout | Vertical slice first: the Imposter reveal end to end, playtest, tune, then spread to everything else |
| Audio files | Claude picks CC0 or CC-BY files and credits them; the user auditions them on a dev-only sound board |
| TV hookup | Mixed. Ship a fixed 200ms phone follow, measure real cast delay in the slice 1 playtest, then decide on a "TV delay" setting |

## Architecture

### Beat timelines (client-side, anchored to the server clock)
- Each moment is data: `Beat { id, atMs, cue? }[]`, with its tuning constants in one file per moment.
- The server still sends one full view per change. Clients stage the reveal using `timerStartedAt` and the server clock.
- Timeline logic is pure (`beatIndexAt`, `msUntilNextBeat`, `isFreshEntry`) and has table tests.
- `useMoment(beats, startedAt, clock)` schedules one `setTimeout` per beat boundary, never re-rendering every frame.
- Cues (sound and haptics) fire only on a live beat entry. There is a 600ms grace window on mount, since views arrive 50–200ms after a phase starts.
- If a TV or phone reconnects mid-reveal, it renders past beats in their end state and plays no replayed cues.
- Phones use the same beats to hold back the personal result, plus `PHONE_FOLLOW_MS = 200`.

### Things exploration found that change the design
1. **Hub broadcasts on no-ops.** `RoomHub.apply()` (`apps/worker/src/room-hub.ts:249`) broadcasts to every socket even when `result.changed` is false. Change it to broadcast only on change, and still send the caller's own view when its reply contains `welcome` (TV reload, second tab). This must land before the typing action does.
2. **`deadline − duration` is not a safe anchor.** Real or Nah `onPlayerRemoved` rebuilds the reveal, so the lie count and duration shrink after a kick. Add a generic `timerStartedAt` that RoomCore sets whenever the deadline value changes. The same field lets `Timer` drain its ring.
3. **Snapshot restore is shallow.** `restoreRoom` does `Object.assign(blankState(), persisted)` (`packages/sdk/src/room.ts:1124`). Every new nested field (inside `lastResult`, `game`, or a game's state) must be optional and normalized with defaults.
4. **Clock offset is sampled late and biased.** `useServerClock` sets the offset in a `useEffect`. Sample it at message receipt in `useRoomSocket` instead, and keep the max of the last ~8 samples, since latency only ever makes a sample smaller (pure `nextClockOffset`).
5. **Points land in totals at different times.** Real or Nah adds them at reveal start; Imposter adds them at result start. Count-ups start from `totals − pointsThisX`.
6. **The guess drama belongs to the Imposter result phase.** `applyGuess` jumps straight to result, and `guess`/`guessCorrect` only exist there. The caught result gets longer.
7. **happy-dom limits.** It has no `AudioContext`, no `navigator.vibrate`, and `canvas.getContext()` returns null. So the audio backend and confetti painter sit behind interfaces with fakes in `src/fixtures/`. Feature-detect with `"vibrate" in navigator` (anti-slop bans `typeof`).
8. **Transforms are taken.** `Card`/`Stamp` use inline `transform: rotate()` and `Stage` uses `transform: scale()`. Effects animate the separate `translate`/`scale` properties only. FLIP reordering measures `offsetTop` (layout px). Shake the game Host root, never `Stage`.
9. **Canvas can't read CSS variables.** Read token colors once via `getComputedStyle`.
10. **Web Audio unlock.** Fetch and decode need no gesture; only `resume()` does. A missing file returns the SPA `index.html` with a 200, so decode must fail gracefully.
11. **Bot harness.** `bot()` must never emit `typing`, or `BotPlaythrough` loops until `maxSteps`.
12. **e2e tests will break.** The longer Real or Nah reveal breaks `e2e/browser/real-or-nah.ts`. The face-down card breaks `e2e/browser/imposter.ts` `findImposter`.
13. **Copy bugs to fix along the way.** Imposter result says "X guessed nothing" plus NOPE when the imposter wasn't caught (Host `ResultLeft`, Phone `ResultView`). Phone `progressFor` labels every result "Final scores".

## Contract changes (deliberate)

### Protocol (`packages/protocol/src/index.ts`)
```ts
interface ActiveGameView { id; view; deadline; timerStartedAt: number | null }   // slice 1
interface Award { id: string; playerIds: PlayerId[]; value: number }             // slice 5
const MAX_AWARDS = 3;
interface GameResultSummary {
  gameId; scores; winnerIds;
  completed: boolean;     // false when ended early
  finishedAt: number;     // ceremony anchor; 0 for old saves
  awards: Award[];        // best first
}
```

### SDK (`packages/sdk/src`)
**`room.ts`**
- Replace `refreshDeadline()` with `setDeadline(now)`. It updates `timerStartedAt` only when the deadline value changes, and is called from `beginGame`, `applyDeadline`, `onSkipPhase`, `runGameAction` and `removeFromRunningGame`.
- `finishGame(now, completed)` stores `finishedAt`, `completed`, and `awards = completed ? sanitizeAwards(def.awards?.(state) ?? [], playerIds) : []`.
- A `resultSummary(stored)` normalizer fills defaults for old snapshots.

**`types.ts`**
- Optional `awards?(state): Award[]` on `GameDefinition`.
- `PlaythroughResult.awards`.

**`testing.ts`**
- Surface the awards.

### GameUi (`packages/ui/src/game-ui.ts`)
- Host and Phone props gain `timerStartedAt`.
- Optional `awardCopy?(award) → { title, detail } | null`. The platform draws the names and avatars.
- Plumb the new props through `apps/web/src/games.tsx`, `screens/HostApp.tsx`, `screens/PlayerApp.tsx`, `screens/fixtures/room.ts`, and both games' `ui/preview.ts`.

### Imposter (`games/imposter/src`)
**Constants**
- `REVEAL_MS = 12000`.
- `RESULT_MS` becomes `resultDurationMs(caught)`: caught 14000 / escaped 9000 / cancelled 6000.
- `TYPING_MIN_INTERVAL_MS = 150`.

**Action `{ type: "typing"; length }`**
- Schema: `int 0..MAX_GUESS_LENGTH`.
- Returns the same state unless all of these hold: phase is last-chance, the sender is the imposter, no guess yet, the length changed, and at least 150ms (`ctx.now`) since the last update.
- Resets to 0 at last-chance start.

**State and views**
- State gains optional `guessLength` and `guessLengthAt`, plus optional `history: ImposterWordRecord[]` (appended in `addWordPoints`) for awards.
- Host view gains `guessLength: number | null`, set in last-chance only. It never carries letters.

**Rules and awards**
- `rules.ts` gains `topVoted`, and `revealOutcome` → `caught | wrong(accusedId) | tie(tiedIds) | no-votes`.
- Awards (`awards.ts`, slice 5):
  - `word-thief`: stole ≥1 word.
  - `master-of-disguise`: escaped ≥1 time.
  - `sharpest-eye`: voted for the imposter ≥2 times.
  - `trusted-crew`: ≥3 crew words with zero votes against.
  - Ties share an award.

### Real or Nah (`games/real-or-nah/src`)
**Reveal timing**
- `REVEAL_MS` goes away. `reveal-plan.ts` exports `revealPlan(reveal): RevealSegment[]` and `revealDurationMs(reveal)`.
- Constants: `RON_REVEAL = { introMs 2000, dudsMs 2000, lieMs 3500, minLieMs 2200, truthMs 4000, standingsMs 3500, capMs 30000 }`.
- Lies that fooled nobody ("duds") share one beat. Lies that fooled someone ("foolers") play one at a time, fewest fooled first:
  - `perLie = clamp(floor((cap − fixed) / foolers), minLieMs, lieMs)`
  - `fixed = introMs + (duds > 0 ? dudsMs : 0) + truthMs + standingsMs`
  - With 8 players or fewer this never goes over 30s.

**State and awards**
- State gains optional `history: RonFactRecord[]`.
- Awards:
  - `best-liar`: fooled ≥2 people in total.
  - `truth-finder`: found ≥2 truths.
  - `greatest-hit`: one lie fooled ≥2 people.
  - `most-trusting`: believed ≥3 lies. Warm copy: "Believed the most lies".

## Shared kit (`packages/ui/src`)
Pure logic lives in helpers with complexity ≤ 4. The shells that touch DOM, audio or canvas stay thin, so every function passes CRAP ≤ 8. Tests inject a `ServerClock`, use a `FakeSoundEngine`, a recording confetti painter and a stubbed `navigator.vibrate`, and never call `vi.mock`.

| Module | Role | Slice |
|---|---|---|
| `moment/timeline.ts`, `useMoment.ts`, `useMomentCues.ts`, `EyesOnTv.tsx` | Beats, live cue firing, phone teaser with heartbeat | 1 |
| `audio/types.ts`, `manifest.ts`, `synth.ts`, `backend.ts`, `loader.ts`, `engine.ts`, `SoundProvider.tsx` | One AudioContext with music and sfx buses, buffer cache, synth recipes, unlock on gesture, `status` locked/running/unsupported, resume on visibility change. `useSound`, `useCue`, and later `useMusic`. Replaces `useSoundSetting` (same `opg:muted` key). The manifest carries credits that TvCredits renders | 1 (music: 4) |
| `haptics.ts` | Named patterns, feature-detected `buzz`, `useBuzz(ref)` = vibrate plus WAAPI pulse | 1 |
| `reduced-motion.ts` | `useReducedMotion()` via matchMedia | 1 |
| `fx/animate.ts`, `SlamStamp.tsx`, `TallyScratch.tsx`, `Spotlight.tsx`, `StickerBurst.tsx`, `fx.css` | Slam, shake, wobble, draw, dim, sneak-out keyframes and WAAPI presets | 1 |
| `fx/FlipCard.tsx`, `LetterTiles.tsx`, `count-up.ts` + `CountUp.tsx`, `flip.ts` + `useFlipList.ts`, `useArrivals.ts` | Role card, guess tiles, count-ups written by rAF to `textContent`, FLIP reorder, new-arrival pops | 2 |
| `fx/confetti-physics.ts`, `confetti-paint.ts`, `Confetti.tsx` | Seeded particles, doodle shapes, caps of TV 160 / phone 60, pauses when hidden, reduced motion → StickerBurst | 2 |
| `Timer.tsx` + `timer-stage.ts` | Stages calm / hurry ≤10s / urgent ≤5s / final ≤3s; CSS-drained ring from `startedAt`; opt-in TV ticks and phone countdown buzz; renders on whole seconds | 2 |
| `chrome.tsx` SoundChip | "Tap for sound" while the audio context is locked | 1 |

**`styles.css`**
- Import `fx.css`.
- Make the reduced-motion rule global (`*, *::before, *::after`) to fix the gaps in `VipGameBar` and `/privacy`.
- Add a `.opg-motion-fade` opt-out so fades survive reduced motion. Reduced motion keeps the beat pacing and sound, and swaps movement for fades, with no shake and static stickers instead of confetti.

**Haptic patterns (ms)**
| Pattern | Use |
|---|---|
| `turn` [90,60,90] | Your clue turn |
| `countdown` [35] | Last 3s of your own timer |
| `locked` [25,40,25] | Vote or lie confirmed |
| `flip` [30] | Role card flip. **Same for both roles, so the buzz can't give the imposter away** |
| `heartbeat` [45,110,45] | Every 1100ms slow / 650ms fast |
| `good` [60,40,60,40,140] | Personal success |
| `soft` [120] | Personal miss |
| `caught` [140,60,260] | You were caught |
| `award` [80,50,80] | You got an award |
| `crown` [70,40,70,40,70,40,320] | You won the crown |

## Moments (storyboards)

### Imposter reveal, 12s
| t | TV | Phones | Sound | Haptic |
|---|---|---|---|---|
| 0.0 | "The votes are in" slides in, tiles deal in, a small "Time's up!" if someone didn't vote | Eyes on the TV | whoosh | heartbeat slow |
| 1.5–5.1 | Tally marks scratch in one voter at a time, round-robin; voter avatars pop in (step = min(450, 3600/marks)) | Teaser | scratch per mark | — |
| 5.5 | Lights dim, top tiles wobble, the spotlight sweeps and settles (two circles on a tie) | "Here it comes…" | drumroll | heartbeat fast |
| 8.0 | **Caught:** IMPOSTER! slam and shake. **Wrong:** NOT THE IMPOSTER. **Tie:** IT'S A TIE! **No votes:** NO VOTES?! | Caught only: "You got caught!" / "You spotted Priya!" (stickers) / "Priya fooled you" | slam / buzzer / boing | caught / good / soft |
| 9.0 | **Caught:** decoy word swipes in under the stamp. **Not caught:** the spotlight swings to the real imposter, who tiptoes off leaving footprints | Not caught only: "You slipped away! +1,000" / "You were right about Priya!" / "They got away" | marker / sneak | good / soft |
| 10.5 | Sticky note: "One last chance, Priya…" or "Priya slipped away: +1,000" | Imposter: "Get ready to guess" | tape | — |

An `aria-live` region states the verdict in words at 8.0s.

### Last chance, 15s (unchanged length)
- **TV:** draining timer, ticks from 10s, big digits for the last 3s. A row of blank tiles mirrors `guessLength` (pop plus scratch when it grows, eraser sound when it shrinks). The tension bed arrives in slice 4.
- **Imposter's phone:** sends `typing` on a 250ms trailing throttle, with a countdown buzz at 3-2-1.
- **Crew phones:** "Priya is guessing… eyes on the TV".

### Imposter result: caught 14s / escaped 9s / cancelled 6s
**Caught:**

| t | TV | Phones | Sound | Haptic |
|---|---|---|---|---|
| 0.0 | "Priya guessed…" with blank tiles | Imposter: "Your guess is in…" | drumroll | heartbeat fast |
| 1.5 | Letters flip in one by one | — | letter tick per letter | — |
| 3.5 | GOT IT ✓ or NOPE ✗ slam; confetti on a steal | Imposter: "You stole the word! +1,000" (confetti) or "So close"; crew: "+500" or "0 this word" | slam, fanfare / buzzer | good / soft |
| 4.5 | "The word was GIRAFFE" | Crew word shown | marker | — |
| 5.5 | Point rows pop in, "+500" chips fly to standings | Own points | pop | good if >0 |
| 7.0 | Standings count up | Own total counts up | count-roll | — |
| 8.5 | Standings FLIP reorder with "▲2" badges | "You moved up to 2nd" | whoosh | — |
| 10.0 | "Word 4 starts in 0:04" | — | — | — |

**Escaped:** "Priya slipped away" at 0, then points at 1.0, count-up at 2.5, reorder at 4.0, settle at 5.5.

### Real or Nah reveal, 11.5–30s
| Segment | TV | Phones | Sound | Haptic |
|---|---|---|---|---|
| intro (2s) | "Let's see who fooled who" | Eyes on the TV | whoosh | heartbeat slow |
| duds (2s) | Lies that fooled nobody drop in together with NAH stamps and author names: "These fooled nobody" | Your dud: "Your lie fooled nobody. Next time!" | stamp | soft |
| each lie | Card slides in; fooled players' avatars pop on; card flips to "Written by Dov" with a NAH slam; "+1,000" chip; callout at ≥3 fooled or when everyone fell for it | Fooled: "Dov's lie got you". Author: "You fooled Sam and Noa! +1,000" (confetti) | whoosh, pop, flip + slam, boing | soft / good |
| truth (4s) | Truth card shows "?", dim, drumroll, REAL slam and shake, answer and source; finders pop in with "+1,000 each" or "Nobody found it! Tricky one." | Finder: "You found it! +1,000" (confetti); others: "The truth: X" | drumroll, slam, pop | heartbeat fast → good / soft |
| standings (3.5s) | Running standings slide in, count up from `totals − pointsThisFact`, FLIP reorder | "You're 2nd (+1,500)" | count-roll, whoosh | — |

### Finale (anchored on `lastResult.finishedAt`; 25s with 3 awards)
- If the game ended early (`completed: false`): "Game over" plus the scoreboard only.
- If `now − finishedAt` is past the total: the settled scoreboard with no cues.

| t | TV | Phones | Sound | Haptic |
|---|---|---|---|---|
| 0 | "That's a wrap!" (lobby music stops) | Results teaser | stinger | — |
| 2 / 5 / 8 | Award cards stamp in | Recipient sees their card; others see "Best liar: Dov" | stamp | award |
| 11 | "And the crown goes to…", dim | Teaser | drumroll 3s | heartbeat fast |
| 14 / 16 | 3rd, then 2nd flip in with count-up | "3rd place!" / "2nd place!" | flip | good |
| 19 | Crown drops on the winner(s), full confetti, "Dov wins the crown!" | Winner: full-screen crown plus confetti; others: winner and their own rank | crown fanfare | crown |
| 22 | FLIP into the full scoreboard | Rank card; the VIP sees "Pick the next game" | lobby loop fades in | — |

When the VIP picks a game, `lobbyScreen` changes and the ceremony unmounts, which stops its audio.

## Cue-to-visual table (slice 5, no-TV mode)

The debt this section pays off: with a TV, sound is a second channel alongside a big shared
screen. With no TV, `SILENT_ENGINE` (`packages/ui/src/audio/types.ts:68-87`) makes every phone
silent (`apps/web/src/routes.ts:14-22`, `apps/web/src/App.tsx:87-92`), and `canVibrate()` —
`"vibrate" in navigator` (`packages/ui/src/haptics.ts:29-31`) — is false on every iPhone. So for a
no-TV phone the **visual is the only channel that can exist at all**, and a beat with no visual of
its own is not degraded, it is gone. This table walks every `useCue`/`useMusic` call site
(`grep -rn "useCue(" games/*/src apps/web/src`) and records, per cue, where it actually fires and
what a no-TV phone shows for it. Built by reading the code, not by re-deriving the storyboards.

`packages/ui/src/audio/types.ts` exports four kinds of id, and only the first is a sound cue that
`play()` accepts; the table below is honest about which is which.

### Sound cues (`CueId`, `play()`)

| Cue | Where it fires | Visual on a no-TV phone | Verdict |
|---|---|---|---|
| `whoosh` | Reveal intro beat, both games (`games/imposter/src/ui/reveal-timeline.ts:63`, `games/most-likely-to/src/ui/reveal-timeline.ts:69`); standings reorder beat, Imposter result (`games/imposter/src/ui/result-timeline.ts:56,77`) | The Vote card unmounts and the Reveal `Card` mounts in its place (`games/imposter/src/ui/stage/Reveal.tsx:308`, `games/most-likely-to/src/ui/stage/Reveal.tsx:337`) — a full-screen swap, not a beat-matched flourish | Sufficient. No dedicated intro flourish exists on the stage (the TV's `FxIn preset="slideIn"` title has no stage equivalent), but the phase change itself is a large, unmistakable visual event. Thin, not a hole. |
| `scratch` | One per tally mark landing, both games' reveal (`reveal-timeline.ts` `scratchOrder`/`spacedBeats`) | `TallyScratch` draws each mark in with an `opg-draw` stroke (`packages/ui/src/fx/TallyScratch.tsx:57-64`, used at `games/imposter/src/ui/stage/Reveal.tsx:167,210` and `games/most-likely-to/src/ui/stage/Reveal.tsx:176`) | Fine — the cue and the mark are the same event. |
| `drumroll` | Reveal "suspense" beat, both games (`reveal-timeline.ts:72` / `:78`); Imposter result "drum" beat, caught path only (`result-timeline.ts:64`) | Reveal: `Suspense` ring + heartbeat dots (`games/imposter/src/ui/stage/Reveal.tsx:221-230`, `games/most-likely-to/src/ui/stage/Reveal.tsx:264-272`). Result "drum" beat: **had none** — fixed in this pass, see below. | Reveal: fine (built in an earlier slice). Result: was a hole; closed. |
| `slam` | Reveal verdict, caught outcome (`reveal-timeline.ts` `verdictCue`); MLT verdict, "picked" outcome; Imposter result verdict, correct guess (`result-timeline.ts` `verdictCue`) | Reveal: `SlamStamp` (`stage/Reveal.tsx:216`, `stage/Reveal.tsx:130` in MLT). Result: a static `VerdictChip` shown from mount, **not gated to the verdict beat at all** — fixed in this pass. | Reveal: fine. Result: was a hole (the outcome was spoiled at t=0, before the guess even finished flipping in); closed. |
| `buzzer` | Reveal verdict, wrong accusation; Imposter result verdict, incorrect guess | Same `SlamStamp`/`VerdictChip` paths as `slam` — the stamp text differs ("Not the imposter" / "Nope"), never colour alone | Same verdict as `slam`. |
| `boing` | Reveal verdict, tie/no-votes outcomes, both games | `centerCaption` text ("It's a tie!" / "No votes?!", `stage/Reveal.tsx:98-103`) | Fine — text-only, already the pattern for an outcome with no target row to stamp. |
| `marker` | Reveal unmask beat, caught outcome (`reveal-timeline.ts:78`); Imposter result "word" beat, caught path (`result-timeline.ts:74`) | Unmask: second `SlamStamp` on the imposter's row (`stage/Reveal.tsx:128`). Word: the crew word in a `Highlight`/`Marker` (`stage/Result.tsx:83-95`), gated on `stage.wordReached` | Fine. |
| `sneak` | Reveal unmask beat, not-caught outcomes; Imposter result "word" beat, escaped path | Unmask: same `SlamStamp` path. Escaped word: the same `WordLine`, gated on `wordReached` | Fine. |
| `tape` | Reveal "next" beat, both games (`reveal-timeline.ts:79` / `:81`); `TvGamePicker` game-start transition (`apps/web/src/screens/TvGamePicker.tsx:114`, no no-TV equivalent needed — it is the VIP's own tap) | MLT: `StickyNote` with `nextNoteText` (`stage/Reveal.tsx:216-220`, `HostReveal.tsx:233-237`). Imposter: **had none** — fixed in this pass. | MLT: fine (built correctly the first time). Imposter: was a hole; closed. |
| `pop` | Vote arrival, TV only (`Host.tsx:521` both games — never fires on a phone at all, TV-exclusive flourish); Reveal/Result "points" beat, both games | Vote arrival: the no-TV `StageVote`/`StageVote` (MLT) shows a check badge the instant `votedIds` includes the voter (`stage/Vote.tsx:64-79` Imposter, `stage/Vote.tsx` MLT) — no animated pop, but the badge appearing is itself the signal, never colour alone (a checkmark icon, not a colour swap). Points: `PointsLine`/`GuessLine` text, gated on the beat | Fine both ways. |
| `tick` | Imposter result, one per letter flipping in (`result-timeline.ts:70`) | `LetterTiles` flips each tile (`stage/Result.tsx:97-114`, `revealed` from `lettersRevealed`) | Fine — the cue and the flip are the same event. |
| `tick-final` | `Timer.tsx:144`, last 3s of any timer, both games' Vote/LastChance/WordCheck phases | The ring itself is CSS-drained from `startedAt` regardless of sound (`Timer.tsx`), and Last Chance additionally has the `Suspense` "drain" ring (`stage/LastChance.tsx:66-73`) | Fine — the timer's own motion carries this; the cue was always a bonus tick, never the only signal. |
| `jingle-start` | Room-level, `HostApp.tsx:160`, phase enters "starting" | TV-only ceremony (the picker/lobby, not a per-game `stage`); out of scope for this task's file ownership. No no-TV phone shows anything different here today. | Open question, not closed here — see "Left open" below. |
| `fanfare` | Finale crown beat, `finale-timeline.ts:29-31` (falls back to `slam` until the kit ships `fanfare`) | `PhoneResults.tsx` already renders its own crown ceremony regardless of room mode, including an `EyesOnTv` teaser with a heartbeat tempo before the crown (`apps/web/src/screens/PhoneResults.tsx:311-318`, `packages/ui/src/moment/EyesOnTv.tsx`) | Fine, and already built — `apps/web/src/screens/` is outside this task's file ownership so it was read, not touched. |

### Not sound cues — audited anyway, since the brief named them

| Name | What it actually is | Where it fires | Visual | Verdict |
|---|---|---|---|---|
| `locked` | `HapticName` (`packages/ui/src/haptics.ts:9`), not a `CueId` | A vote/lie/pick locking in, both games' Phone components (`games/imposter/src/ui/Phone.tsx:597-618`, `games/most-likely-to/src/ui/Phone.tsx:111-132`) | `useBuzz()` always pairs the vibrate with a WAAPI `pulse()` scale flash on the same element, or a reduced-motion outline flash (`packages/ui/src/haptics.ts:44-75`) | Fine by construction — no call site can buzz without a paired visual. |
| `lobby` | `MusicId` (`packages/ui/src/audio/types.ts:25`), a loop, not a one-shot cue | `screen-music.ts:14`, while `phase === "lobby"` | The lobby screen itself (silent regardless of TV mode) | N/A — a loop has no "moment" to lose; nothing plays on a phone at any point either way. |
| `tension` | `MusicId` | `useMusic("tension")` during Vote/LastChance, all three games' `Host.tsx`/`HostLastChance.tsx` | The Suspense "drain" ring during Last Chance (`stage/LastChance.tsx`); no dedicated visual during Vote, but Vote has no drumroll-like beat to fill — it is open-ended until everyone votes | Fine for Last Chance. Vote's tension bed was always ambience, not a load-bearing beat. |
| `running` / `unsupported` | `SoundStatus` values (`packages/ui/src/audio/types.ts:30`), not cues | `SoundEngine.status()`; `SILENT_ENGINE.status` is always `"unsupported"` | The kit's sound chip (`chrome.tsx:99-121`) is TV-only, mounted only by `TvHeader` (`chrome.tsx:143-158`) | Correct as designed (plan §3): "there is nothing to unmute" on a phone that never had sound. |

### Holes found and closed in this pass

1. **Imposter result "drum" beat had no visual.** `games/imposter/src/ui/stage/Result.tsx` played no cue (phones are silent) and showed no ring during the 0–3.5s the TV spends on `drumroll` before the guess even starts flipping in. Fixed by adding a small `Suspense` ring (`variant="reveal"`, `size={40}`) next to the "Priya guessed" line, gated to the same window as the TV's blank tiles, and removed once the verdict beat lands.
2. **Imposter result's verdict chip was never gated to the verdict beat at all.** `VerdictChip` rendered "Stolen!"/"Nope" unconditionally from the moment the phase mounted — the outcome was visible before the drumroll, before the letters, before anything else, which is the opposite of the TV's beat-by-beat build (`HostResult.tsx:207` gates the same text on `stage.verdict`). Fixed by gating the chip on the verdict beat (the word beat, for the escaped path, which has no suspense beat of its own) and wrapping it in `FxIn preset="pop"` so it lands rather than always having been there.
3. **Imposter's Reveal "next" beat (the `tape` cue) had no sticky note.** `games/most-likely-to/src/ui/stage/Reveal.tsx` already showed one (`NextNote`/`StickyNote`); Imposter's `stage/Reveal.tsx` did not. Fixed by exporting `nextNoteText` from `HostReveal.tsx` (previously inlined in its own `NextNote`) and rendering the same `StickyNote` on the stage.

### Left open

- **`jingle-start`** (the game-starting jingle) has no no-TV visual counterpart today. It fires from `apps/web/src/screens/HostApp.tsx`, a room-level screen outside a per-game `stage` and outside this task's file ownership (`apps/web/src/screens/` was not on the owned-files list for this pass). The "starting" phase is brief and VIP-initiated (the VIP just tapped Start), so the risk is low, but it was not verified against a no-TV fixture and should get its own pass.
- **Reduced-motion and screen-reader passes on `apps/web/src/screens/` (finale, lobby, game picker)** are likewise out of this task's ownership; only the two opted-in games' `src/ui/` and the kit's `fx/` were walked exhaustively.

## Milestones

### Slice 0: record the plan
Save this plan as `plan/0002-game-feel.md`, following the repo's intent/plan convention.

### Slice 1: Imposter reveal end to end (then playtest)
**Contracts**
- `timerStartedAt` in protocol, RoomCore (+ tests), GameUi, and the web plumbing.
- Clock offset sampled at message receipt (`apps/web/src/useRoomSocket.ts`, `packages/ui/src/clock.ts`).

**Imposter**
- `REVEAL_MS = 12000`, plus `topVoted` and `revealOutcome`.
- Split the 1276-line `ui/Host.tsx`: `ui/reveal-timeline.ts`, `ui/HostReveal.tsx`, `ui/PhoneReveal.tsx`.
- `preview.ts` gets wrong, tie and no-votes fixtures.

**Kit**
- `moment/*`, `audio/*`, `haptics.ts`, `reduced-motion.ts`.
- `fx/{animate, SlamStamp, TallyScratch, Spotlight, StickerBurst}`, `fx.css`.
- `styles.css` reduced-motion fix, SoundChip locked state, `fixtures/audio.ts`.

**App**
- `SoundProvider` in `App.tsx`; phones get the silent engine.
- Call `unlock()` inside the "Start a room" click (`TvLanding.tsx`).
- `TvCredits` renders the manifest.
- Dev-only lazy routes `/dev/sounds` (sound board) and `/dev/moments` (replays preview fixtures on a scrubbable fake clock, TV and phone side by side).

**Assets**
- `apps/web/public/audio/{slam,buzzer,boing,sneak}.mp3`: Kenney CC0 files, with the license checked at download and the source URL stored.
- MP3 for Safari and TV-browser decode support; transcode with ffmpeg if needed.
- A test that asserts files exist, their sizes, and that every file has a CC0 or CC-BY credit.

**Done when**
- All four outcomes match the storyboard.
- Phone results land within about 200ms of the TV beat on LAN.
- Reloading the TV or a phone mid-reveal lands on the right beat with no replayed cues.
- VIP Skip silences audio.
- Mute survives a reload; the locked chip unlocks on a tap or keypress.
- Reduced motion keeps the same timing with fades only.
- `pnpm check` and the imposter e2e pass.
- **The user playtests with a TV and phones, measures cast delay, and signs off on timing before slice 2.**

### Slice 2: rest of Imposter
- **Kit:** FlipCard, LetterTiles, CountUp, FLIP list, arrivals, Confetti, Timer stages.
- **Imposter:** typing action and state; `resultDurationMs`; `HostLastChance`, `HostResult`, `PhoneResult` plus `result-timeline.ts`; WordCard flip; YourTurn and vote-locked buzzes; vote arrival pops; the escaped-copy fix.
- **Worker:** hub broadcasts only on change (+ tests: a no-op sends nothing, a welcome still gets a view).
- **e2e:** update `imposter.ts` to flip the card.
- **Decide:** whether casting needs a host "TV delay" setting, based on the slice 1 measurement.
- **Done when:**
  - No letters ever leak to the TV.
  - Spamming `typing` stays at ≤7 broadcasts per second.
  - The React Profiler shows no per-frame renders.
  - The 3- and 8-player bot playthroughs pass.

### Slice 3: Real or Nah
- `reveal-plan.ts`, `ui/reveal-timeline.ts`, `HostReveal.tsx`, `PhoneReveal.tsx`, `Standings.tsx`.
- Write and vote arrival pops with locked buzzes.
- e2e per-step timeouts.
- **Done when:** a kick mid-reveal doesn't replay beats and the duration formula tests pass.

### Slice 4: lobby, start, music, transitions
- Engine music slot with crossfade and ducking; `useMusic`.
- Lobby loop in `TvLobby`/`TvGamePicker`, fading out on start; start stinger and game title card; tension bed in vote and last-chance phases.
- Join pops in `TvLobby`.
- Paper-swipe screen transition (≤400ms) in `HostApp.tsx`.
- CC-BY attribution text exact in credits.

### Slice 5: awards and finale
- Protocol `Award` and the `GameResultSummary` fields; SDK `awards` hook, `finishGame`, and snapshot normalizer.
- `games/*/src/awards.ts` plus history, and `awardCopy`.
- `apps/web/src/screens/{finale-timeline.ts, TvFinalScores.tsx, PhoneResults.tsx}`.
- **Done when:**
  - Awards are deterministic.
  - An old snapshot restores to the settled scoreboard.
  - Ended-early games skip the crown.
  - The VIP can leave the ceremony at any time.

### Slice 6: polish and audits
- ~~A table mapping each cue to its visual equivalent, and reduced-motion tests per moment.~~ Done
  in `plan/0004-no-tv-mode.md` slice 5, scoped to the two no-TV games and the kit's `fx/`; see
  "Cue-to-visual table (slice 5, no-TV mode)" above. `apps/web/src/screens/` (lobby, game picker,
  finale) was not re-audited here.
- Low-end TV stick and Android Go pass (confetti caps, DPR).
- Six games in a row with no leaks of AudioNodes, timers or listeners.
- Shake ≤12px, no flashes above 3Hz.
- Loudness normalized.
- Check `minutes` in the game picker against the new lengths.

## Risks
- **Audio after a TV reload** needs a gesture. The "Tap for sound" chip and keydown unlock cover it, and visuals never depend on audio.
- **Cast/AirPlay delay** (0.5–2s) can let phones spoil the slam. Measure it in slice 1; if needed, add a host `avDelayMs` room setting.
- **Snapshot compatibility:** every new field is optional with normalizers, so a deploy mid-reveal just lands mid-timeline.
- **Typing volume:** kept bounded by the in-game 150ms interval, the 250ms client throttle and the hub no-op fix.
- **Devtools spoilers:** phones receive the reveal data about 8s early. Acceptable for a party game, since the TV makes it public.
- **Longer games:** roughly +1 minute each.

## Verification
1. **Unit tests** (pure pieces):
   - Timeline, `anchorAt`, `nextClockOffset`.
   - `topVoted`, `revealOutcome`, and each timeline's beat order and total duration.
   - Typing rules, including that the bot never types.
   - `revealPlan` and `revealDurationMs` for 0 lies, duds only, and 8 foolers (cap).
   - Awards: ties, thresholds, kicked players.
   - RoomCore `timerStartedAt` on begin, early end, skip, kick, and a non-final vote; `finishGame` fields; restoring an old snapshot.
   - Hub no-op broadcast; synth envelopes, confetti physics, `countAt`, `flipOffsets`, `timerStage`, and the manifest license check.
2. **Component tests** (happy-dom, fake timers, injected clock, FakeSoundEngine, stubbed vibrate):
   - HostReveal: no stamp before 8000ms, stamp at 8000ms for each outcome, and mounting at 9000ms shows the end state with zero cues.
   - PhoneReveal: shows the teaser until the personal beat.
   - A TV plus phone sync test on one shared clock.
   - SoundChip locked state and mute persistence; TvCredits lists every credit.
3. **Bot playthroughs:** the existing 3- and 8-player runs with disconnect/rejoin still finish, and awards come from each game's list.
4. **`pnpm check`:** packs validate, Oxlint reports 0, typecheck exits 0, all Vitest pass, CRAP shows no failures, and Vite prints `built in`. Then run `pnpm e2e:setup && pnpm e2e`.
5. **Manual playtest** (`pnpm dev`):
   - **Setup:** the TV in a Chrome window (click "Start a room" to unlock audio, then go full screen). Phones in 3 Chrome profiles with device emulation, or real phones on LAN via `pnpm --filter @opg/web exec vite --host` (Android for vibration, iPhone for the pulse-only path).
   - **Outcomes:** force caught, wrong vote, and a 2–2 tie.
   - **Reloads and skip:** reload the TV about 6s into the reveal and reload a phone mid-reveal (no replayed cues); press VIP Skip during the drumroll (silence).
   - **Rendering:** emulate reduced motion (same timing, fades only); throttle one phone to Fast 3G.
   - **Performance:** Performance panel shows no long tasks; the React Profiler shows renders ≈ beats.
   - **Audio:** audition every cue on `/dev/sounds`; check `/credits`. Compare the TV against this storyboard on `/dev/moments`.
