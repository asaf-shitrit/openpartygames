# OpenPartyGames

Open-source Jackbox-style party games: one host screen (TV/laptop) plus phones joining by room code. Cloudflare Workers + Durable Objects + D1, TypeScript, React + Vite. Intent: `intent/0001-platform-mvp.md`. Plan and rules: `plan/0001-platform-mvp.md`. Designs: `design/*.dc.html` (open in a browser at frame size) and `design/AVATARS.md`.

## Commands

- Install: `pnpm install`
- Dev: `pnpm dev` (Vite on :5173 proxying to `wrangler dev` on :8787). First time: `pnpm --filter @opg/worker db:migrate:local && pnpm --filter @opg/worker db:seed:local`
- Lint: `pnpm lint` (Oxlint, type-aware, anti-slop plugin; warnings fail). One folder: `pnpm exec oxlint --type-aware --deny-warnings <dir>`
- Typecheck: `pnpm typecheck` (every workspace; the worker runs `wrangler types` first)
- Test: `pnpm test` (Vitest projects, one per workspace). One package: `cd <dir> && pnpm exec vitest run`
- CRAP gate: `pnpm crap` (threshold 8; runs coverage per package). One folder: `pnpm exec crap-typescript --format text --failures-only --threshold 8 <dir>`
- Packs: `pnpm validate:packs`
- Build web: `pnpm build`
- Everything: `pnpm check`

## Verifying your work

Run `pnpm check` before reporting done. Healthy output: packs validate with no errors, Oxlint reports 0 problems, every `typecheck` exits 0, all Vitest tests pass (never skip or delete a failing test), `crap-typescript` reports no failed methods, and Vite prints `built in`. For UI work also run `pnpm dev` and look at the screen next to its design file.

## Architecture

- `packages/protocol`: wire types and `parseClientMessage`. Contract; change only deliberately.
- `packages/sdk`: Game SDK types (contract), seeded rng, `RoomCore` (pure room engine), testing harness with bot playthroughs.
- `games/<id>`: `src/index.ts` exports a pure `GameDefinition`; `src/ui/` exports `GameUi` Host/Phone components.
- `apps/worker`: Worker routes + `Room` Durable Object adapter around RoomCore; D1 migrations.
- `apps/web`: host stage (1920×1080 scaled) and phone UI.
- `packages/ui`: Doodle Notebook UI kit.
- `packs/`: JSON content packs, validated in CI.

## Conventions

- TypeScript strict, ESM, no default exports except React route components. Workspace packages export `src/*.ts` directly.
- Games and RoomCore are pure and deterministic: no `Date.now()`, `Math.random()`, timers or I/O. Use `ctx.now` and `ctx.rng`. State must be plain JSON.
- A player's view never contains another player's secrets.
- Don't add or upgrade dependencies without asking.
- Player-visible copy: short, warm, plain. Never color alone for meaning (pair with icon/text).
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
- Commit messages must not attribute Claude.
