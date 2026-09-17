# Contributing to OpenPartyGames

Thanks for helping. This guide covers the ways in, the Game SDK, the pack format, and how review works.

By contributing you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Content packs.** Add word pairs or facts without touching git. Open the "Add word pairs" or "Add facts" issue form; an Action validates the submission and opens a pull request. You can also edit `packs/` and open a PR yourself.
- **New games.** A game is a workspace package under `games/<id>/` built on the Game SDK. Read the SDK section below and mirror an MVP game.
- **Bugs and ideas.** Open a GitHub issue. For a new game idea, include a working name, one paragraph of rules, player count, the SDK capabilities it needs, and where its content comes from. See [ROADMAP.md](ROADMAP.md).

## Before you open a PR

Run `pnpm check` and make it pass. It validates packs, lints with Oxlint (type-aware, anti-slop, warnings fail), typechecks every workspace, runs all tests, enforces a CRAP score of at most 8 per function, and builds the web app.

Never add `oxlint-disable` comments, edit `.oxlintrc.json`, or loosen coverage settings to make a check pass. Fix findings at the root.

## The Game SDK in brief

A game is one pure, deterministic rule module plus React UI.

- `games/<id>/src/index.ts` exports a `GameDefinition`: phases, scoring, and a `setup`/`onAction`/`onDeadline` state machine over plain JSON state.
- Each game parses its own player input with a zod `actionSchema`. Untrusted input is parsed at the boundary; nothing else takes `unknown`.
- Rules are pure and deterministic. No `Date.now()`, `Math.random()`, timers or I/O. Use `ctx.now` for time and `ctx.rng` for randomness, so replays and tests are reproducible.
- A player's view must never contain another player's secret — not the imposter's identity, not the decoy word, not which option is the truth.
- `games/<id>/src/ui/` exports a `GameUi` with a Host component (the shared screen) and a Phone component (one player's view).

Required tests for a game:

- Unit tests for the rules: each phase transition, scoring and edge cases.
- A bot playthrough at 3 players and at 8 players, including a disconnect and rejoin, using the SDK testing harness.
- UI tests with `@testing-library/react` for the Host and Phone components.

## Content packs

Packs are JSON files under `packs/`. The rules live in `scripts/pack-rules.mjs`; CI runs the same rules.

- `packs/imposter/*.json` holds word-pair packs (`kind: "word-pairs"`).
- `packs/real-or-nah/*.json` holds fact packs (`kind: "facts"`).
- `packs/most-likely-to/*.json` holds superlative prompt packs (`kind: "superlatives"`). There is no issue form for these yet, so send new prompts as a pull request.

Every pack declares:

- `id` — kebab-case, and it must match the filename.
- `name`, `attribution`.
- `kind` — `word-pairs` in `packs/imposter/`, `facts` in `packs/real-or-nah/`, `superlatives` in `packs/most-likely-to/`.
- `rating` — `family`, `teen` or `adult`.
- `language` — `en` for now.
- `license` — `CC0-1.0`, `CC-BY-4.0` or `CC-BY-SA-4.0`.
- `items` — a non-empty array.

Word pairs are `{ "crew": "...", "decoy": "..." }`:

- both fields lowercase, non-empty, at most 24 characters
- `crew` and `decoy` must differ
- no duplicate `crew` values within a pack

Facts are `{ id, prompt, answer, alternates, decoys, source }`:

- `id` — non-empty and unique within the pack
- `prompt` — exactly one `____` blank
- `answer` — non-empty, at most 40 characters
- `alternates` — array of other accepted spellings
- `decoys` — at least 2, and none may normalize to the answer or an alternate
- `source` — `{ "title": "...", "url": "https://..." }`; every fact cites its source

Superlatives are `{ id, prompt }`, where `prompt` finishes "Who's most likely to …?":

- `id` — non-empty and unique within the pack
- `prompt` — at most 80 characters, starts lowercase, no ending `?`, `.` or `!` (the game adds the question mark)
- no prompt may start with "most likely", "who" or "to", or repeat another prompt in the pack
- keep it playful: habits, quirks, harmless hypotheticals. Nothing about looks, bodies, intelligence, money, dating, alcohol or drugs, crime, health or protected traits. Family and teen packs are on by default, so every prompt has to be fine in a classroom.

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
