# OpenPartyGames

Open-source Jackbox-style party games. Two ways to play: a host screen (TV/laptop) plus phones joining by room code, or phones alone with no shared screen, where each phone carries the stage above its own controls. Games opt into the second with `GameDefinition.noTv`; rooms carry `sharedScreen`. TV mode is the default and is unchanged by it. Cloudflare Workers + Durable Objects + D1, TypeScript, React + Vite. Intent: `intent/0001-platform-mvp.md`. Plan and rules: `plan/0001-platform-mvp.md`, `plan/0002-game-feel.md`, `plan/0003-doodle-bluff.md`, `plan/0004-no-tv-mode.md`. Designs: `design/*.dc.html` (open in a browser at frame size) and `design/AVATARS.md`.

## Commands

- Install: `pnpm install`
- Dev: `pnpm dev` (Vite on :5173 proxying to `wrangler dev` on :8787; a second checkout sets `OPG_WEB_PORT` and `OPG_WORKER_PORT`). First time: `pnpm --filter @opg/worker db:migrate:local && pnpm --filter @opg/worker db:seed:local`
- Lint: `pnpm lint` (Oxlint, type-aware, anti-slop plugin; warnings fail). One folder: `pnpm exec oxlint --type-aware --deny-warnings <dir>`
- Typecheck: `pnpm typecheck` (every workspace; the worker runs `wrangler types` first)
- Test: `pnpm test` (Vitest projects, one per workspace). One package: `cd <dir> && pnpm exec vitest run`
- Layout invariants: `pnpm e2e:layout` (every game screen at three phone sizes and the TV, in English and Hebrew; needs `pnpm exec playwright install chromium` once). One screen: open `/dev/screens?id=<game>/<index>` under `pnpm dev`
- CRAP gate: `pnpm crap` (threshold 8; runs coverage per package). One folder: `pnpm exec crap-typescript --format text --failures-only --threshold 8 <dir>`
- Packs: `pnpm validate:packs`
- Visual baselines (Linux-only, made in CI): `scripts/pull-visual-baselines.sh <branch>`
- Design as a picture: `node scripts/build-design-previews.mjs --one <artboard>` (e.g. `TVRealOrNahReveal`) renders one `design/*.dc.html` at its frame size to a PNG in the temp dir and prints the path; `--out <file>` picks the path. With no flag it redraws the README pages in `design/previews/` (commit those). Use it rather than writing a renderer.
- Build web: `pnpm build`
- Everything: `pnpm check`; with every e2e suite: `pnpm verify` (logs in `.verify/`, one summary line per suite)

## Verifying your work

Run `pnpm check` before reporting done. Healthy output: packs validate with no errors, Oxlint reports 0 problems, every `typecheck` exits 0, all Vitest tests pass (never skip or delete a failing test), `crap-typescript` reports no failed methods, and Vite prints `built in`. For UI work also run `pnpm dev` and look at the screen next to its design file; `node scripts/build-design-previews.mjs --one <artboard>` gives you the design as a PNG at the same size as the screen.

`pnpm check` does not run `e2e/api`, `e2e/browser` or `e2e/layout`, so it cannot catch a change that only breaks in a real browser. A change to a screen, a flow, or anything under `apps/web/src/screens` or `games/*/src/ui` needs the browser suites that cover it before calling it done. They fail on different things:

- `pnpm e2e:layout` — what a screen **draws**, at three phone sizes and the TV in both locales: words across an edge, anything past the bottom of a screen that does not scroll, a phone tap target under 44px, TV text under 28px. Needs only Vite. Run it for any change to what a screen renders: `pnpm check` and `e2e:browser` both stay green on a screen that overflows. One game: `pnpm e2e:layout -g <game-id>`.
- `pnpm e2e:browser` — what a flow **does**: a real room, real clicks, a reconnect. About 3 minutes; needs `wrangler` and a local D1, which is why it isn't part of `pnpm check`. Run it for a change to a flow or to a screen's behaviour.

In `e2e/browser`'s output, watch the pass count: the `imposter` project depends on `fast`, so any failure in `fast` makes Playwright skip `imposter` entirely rather than reporting it failed — a red run showing `1 failed, 10 passed` instead of `12 passed` means the Imposter spec never ran. Before merging a branch, run `pnpm verify`.

Reviewing a diff: apply every rule in `CODING_STANDARDS.md`.

## Architecture

- `packages/protocol`: wire types and `parseClientMessage`. Contract; change only deliberately.
- `packages/sdk`: Game SDK types (contract), seeded rng, `RoomCore` (pure room engine), testing harness with bot playthroughs.
- `games/<id>`: `src/index.ts` exports a pure `GameDefinition`; `src/ui/` exports `GameUi` Host/Phone components.
- `apps/worker`: Worker routes + `Room` Durable Object adapter around RoomCore; D1 migrations.
- `apps/web`: host stage (1920×1080 scaled) and phone UI.
- `packages/ui`: Doodle Notebook UI kit.
- `packages/i18n`: `LocaleProvider`, the `en`/`he` dictionaries, and the plural helpers.
- `packs/`: JSON content packs, validated in CI.

## Conventions

- TypeScript strict, ESM, no default exports except React route components. Workspace packages export `src/*.ts` directly.
- Games and RoomCore are pure and deterministic: no `Date.now()`, `Math.random()`, timers or I/O. Use `ctx.now` and `ctx.rng`. State must be plain JSON. `scripts/purity.test.ts` scans the SDK, the protocol and every game's rules for these and fails `pnpm test` on a violation.
- A player's view never contains another player's secrets.
- Don't add or upgrade dependencies without asking.
- Player-visible copy: short, warm, plain. Never color alone for meaning (pair with icon/text). Copy comes from `packages/i18n`, not hardcoded English; a new key goes in both `en/` and `he/` with the same `{placeholders}` in each, enforced by `packages/i18n/src/placeholder-parity.test.ts`.
- A screen a player cannot read or tap is a release blocker: nothing with words or a tap target may cross the screen edge, sit past the bottom of a screen that does not scroll, or be covered by anything else. `e2e/layout/` measures this in a real browser on every push; happy-dom reports every rect as zero, so no unit test can.
- Each game's `preview.ts` carries worst-case fixtures: the longest content its packs ship, eight players, names at `NAME_MAX_LENGTH`. Add content longer than `STRESS_TEXT` and `scripts/content-stress.test.ts` fails until the fixture catches up.
- Headings/stamps use Permanent Marker; everything else Atkinson Hyperlegible. TV text ≥ 28px at 1920×1080, phone text ≥ 16px, tap targets ≥ 44px.
- Content packs: every fact cites a source URL; licenses CC0-1.0, CC-BY-4.0 or CC-BY-SA-4.0 only. No Jackbox names/text/art, no NonCommercial content.

## Lint and CRAP rules

- Fix findings at the root. Never add `oxlint-disable` comments, never edit `.oxlintrc.json` or coverage settings in `vitest.config.ts` to make a check pass, never add casts to silence a rule.
- Parse untrusted input with zod at the boundary (`clientMessageSchema`, each game's `actionSchema`); no `unknown` parameters or `typeof` checks elsewhere. A type assertion needs a `// SAFETY:` comment stating the invariant.
- CRAP = complexity² × (1 − coverage)³ + complexity, gated at 8 per function. Keep functions small (split into named helpers) and cover them with tests that assert behavior. Untested files count as 0% coverage.
- React components get tests with `@testing-library/react` (`// @vitest-environment happy-dom` at the top of `.test.tsx` files outside `packages/ui` and `apps/web`).

## Things to watch

- Deploys restart Durable Objects: always persist the room snapshot after a change and let clients reconnect.
- Keep WebSocket messages bounded: one view broadcast per change.

## Agent skills

### Issue tracker

GitHub Issues in `asaf-shitrit/openpartygames`, through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
