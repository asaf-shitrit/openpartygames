# Contributing to OpenPartyGames

Thanks for helping. This guide covers the ways in, the Game SDK, the pack format, and how review works.

By contributing you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Content packs.** Add word pairs, facts, superlatives or drawing prompts without touching git. Open the "Add word pairs", "Add facts", "Add superlatives" or "Add a drawing prompt" issue form and pick a pack. Packs are grouped by language, English first, then Hebrew; a Hebrew fact goes into a Hebrew pack. An Action validates the submission and opens a pull request. You can also edit `packs/` and open a PR yourself.
- **New games.** A game is a workspace package under `games/<id>/` built on the Game SDK. Read the SDK section below and mirror an MVP game.
- **Bugs and ideas.** Open a GitHub issue. For a new game idea, include a working name, one paragraph of rules, player count, the SDK capabilities it needs, and where its content comes from. See [ROADMAP.md](ROADMAP.md).

## Before you open a PR

Set up as in the [README](README.md#run-it-locally), then run `pnpm check` and make it pass. It runs the same gates as CI, in this order:

- `pnpm validate:packs`: every pack is valid, licensed and complete.
- `pnpm lint`: Oxlint, type-aware, with the anti-slop plugin. Warnings fail.
- `pnpm typecheck`: every workspace.
- `pnpm test`: Vitest, one project per workspace.
- `pnpm crap`: a CRAP score of at most 8 per function.
- `pnpm build`: the web bundle.

CI also runs the browser suites on every pull request: `pnpm e2e:layout` (every game screen at three phone sizes and the TV, in English and Hebrew), `pnpm e2e:api` and `pnpm e2e:browser` (real rooms against the Worker and a local D1). You do not have to run them locally. To try one, install the browser once with `pnpm exec playwright install chromium`. Run `pnpm e2e:layout` if you change what a screen draws: `pnpm check` stays green on a screen that overflows.

Never add `oxlint-disable` comments, edit `.oxlintrc.json`, or loosen coverage settings to make a check pass. Fix findings at the root.

A few rules are enforced by tests, so `pnpm test` fails when you break them:

- Every key in the `en` dictionary has a `he` twin with the same `{placeholders}` (`packages/i18n/src/placeholder-parity.test.ts`). Player-visible copy comes from `packages/i18n`, never hardcoded.
- Every `en` string is rendered by some gallery screen, so the layout suite measures it (`apps/web/src/i18n-render-coverage.test.tsx`). Give a new string a preview. `apps/web/src/dev/unrendered-copy.ts` may only shrink.
- Every artboard in `design/canvas.json` names the preview that renders it, or `null` (`apps/web/src/dev/design-map.test.ts`). Renaming a preview label means updating its artboard.

A new screen needs an accepted design in `design/` before it is built, and it has to work at phone sizes in English and in Hebrew (right to left). See [CLAUDE.md](CLAUDE.md) for the rest of the project's rules.

## The Game SDK in brief

A game is one pure, deterministic rule module plus React UI.

- `games/<id>/src/index.ts` exports a `GameDefinition`: phases, scoring, and a `setup`/`onAction`/`onDeadline` state machine over plain JSON state.
- Each game parses its own player input with a zod `actionSchema`. Untrusted input is parsed at the boundary; nothing else takes `unknown`.
- Rules are pure and deterministic. No `Date.now()`, `Math.random()`, timers or I/O. Use `ctx.now` for time and `ctx.rng` for randomness, so replays and tests are reproducible.
- A player's view must never contain another player's secret — not the imposter's identity, not the decoy word, not which option is the truth.
- `games/<id>/src/ui/` exports a `GameUi` with a Host component (the shared screen) and a Phone component (one player's view).
- Playing with no shared screen is **opt-in**. A game that can carry its whole ceremony on a phone sets `noTv: true` on its `GameDefinition`; one that says nothing stays shared-screen only, and the picker explains why rather than hiding it. The Phone component then receives a `stage` prop, which is the host view unchanged and `null` in a room with a shared screen — so `stage !== null` is the flag, and a game can never put something on the stage that is not already on the shared screen. Each stage section lives in its own small file under `src/ui/stage/`; the existing phase switch keeps owning dispatch. `games/most-likely-to/` is the worked example.
- Phones are silent with no shared screen, so **every audio cue needs a visual equivalent** there, and a verdict needs a visible change large enough to read with no sound and no buzz — iOS Safari has no Vibration API, so an iPhone gets neither.

Required tests for a game:

- Unit tests for the rules: each phase transition, scoring and edge cases.
- A bot playthrough at 3 players and at 8 players, including a disconnect and rejoin, using the SDK testing harness.
- UI tests with `@testing-library/react` for the Host and Phone components.
- A game declaring `noTv` also needs a test asserting its stage deep-equals its host view across every phase, so the two cannot drift.

## Content packs

Packs are JSON files under `packs/`. The rules live in `scripts/pack-rules.mjs`; CI runs the same rules.

- `packs/imposter/*.json` holds word-pair packs (`kind: "word-pairs"`).
- `packs/real-or-nah/*.json` holds fact packs (`kind: "facts"`).
- `packs/most-likely-to/*.json` holds superlative prompt packs (`kind: "superlatives"`).
- `packs/doodle-bluff/*.json` holds drawing-prompt packs (`kind: "drawing-prompts"`).

Every pack declares:

- `id` — kebab-case, and it must match the filename.
- `name`, `attribution`. `attribution` must be non-empty for `CC-BY-4.0` and `CC-BY-SA-4.0` packs.
- `kind` — `word-pairs` in `packs/imposter/`, `facts` in `packs/real-or-nah/`, `superlatives` in `packs/most-likely-to/`, `drawing-prompts` in `packs/doodle-bluff/`.
- `rating` — `family`, `teen` or `adult`.
- `language` — `en` or `he`. A Hebrew room lists only Hebrew packs, so a `he` pack's `name` must be written in Hebrew and an `en` pack's `name` must not contain Hebrew.
- `license` — `CC0-1.0`, `CC-BY-4.0` or `CC-BY-SA-4.0`.
- `items` — a non-empty array.

Word pairs are `{ "crew": "...", "decoy": "..." }`:

- both fields lowercase, non-empty, at most 24 characters
- `crew` and `decoy` must differ
- no duplicate `crew` values, within a pack or across packs

Facts are `{ id, prompt, answer, alternates, decoys, source }`:

- `id` — non-empty and unique within the pack
- `prompt` — exactly one `____` blank; the same prompt (compared after normalizing) must not appear in two packs
- `answer` — non-empty, at most 40 characters
- `alternates` — array of other accepted spellings
- `decoys` — at least 2, and none may normalize to the answer or an alternate
- `source` — `{ "title": "...", "url": "https://..." }`; every fact cites its source

Superlatives are `{ id, prompt }`, where `prompt` finishes "Who's most likely to …?":

- `id` — non-empty and unique within the pack
- `prompt` — at most 80 characters, starts lowercase, no ending `?`, `.` or `!` (the game adds the question mark)
- no prompt may start with "most likely", "who" or "to", or repeat another prompt in the pack or in another superlatives pack
- keep it playful: habits, quirks, harmless hypotheticals. Nothing about looks, bodies, intelligence, money, dating, alcohol or drugs, crime, health or protected traits. Family and teen packs are on by default, so every prompt has to be fine in a classroom.

Drawing prompts are `{ id, prompt, houseTitles }`:

- `id` — non-empty and unique within the pack
- `prompt` — something drawable, at most 60 characters, starts lowercase, no ending `?`, `.` or `!`, no giveaway words like "the word", "spell" or "written" (it has to be drawn, not written)
- no prompt may repeat another prompt in the pack, and the same prompt must not appear in two different packs
- `houseTitles` — at least 4 believable fake titles for the drawing, none matching the prompt or each other once normalized, each at most 60 characters

## Licensing

Contributions are inbound = outbound: what you send is licensed the same way it ships. No DCO, no CLA.

- Code is AGPL-3.0.
- Packs are licensed under their declared license, CC BY-SA 4.0 by default.
- Every fact keeps a source URL, and facts must be paraphrased from the cited source, not copied.
- No NonCommercial content. For example, Cards Against Humanity's CC BY-NC-SA cards are off limits.
- No Jackbox names, text, art or audio. Game mechanics can be reused; names, text and art cannot. "Inspired by" references are fine in docs.
- Audio is CC0, or CC BY with attribution on the in-app credits screen and in the repo.

## Review and maintainers

At launch only the maintainer merges. That keeps review load and security review in one pair of hands while the codebase is young.

Active contributors can be promoted to maintain an area — a game, or content packs. If you have landed several reviewed changes in an area and want to own it, say so in an issue. Area maintainers review and merge within their area; the project maintainer keeps the final say on releases and cross-cutting changes.

## Questions

Open a GitHub issue, or comment on the issue or pull request you're working from.
