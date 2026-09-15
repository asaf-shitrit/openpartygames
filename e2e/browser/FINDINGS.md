# Browser e2e findings

Suite: `e2e/browser` (Playwright + Chromium), run with `CI=true pnpm e2e:browser`.
It drives the real web app (built assets served by `wrangler dev`), the Worker,
the Room Durable Object and a local D1 seeded from `packs/`.

Result: all five specs pass. No reproducible product bug was found; no product
code was changed for the suite.

Specs:

- `join.spec.ts` — the TV creates a room, three phones join the real join/avatar
  flow, and only the VIP sees the start control.
- `real-or-nah.spec.ts` — a full six-fact game through the phone UI, asserted on
  the TV's write/vote/reveal screens and the final scores.
- `imposter.spec.ts` — a full six-word game. The harness reads each phone's own
  word screen to learn who the imposter is, so the crew catches them on purpose
  and every word exercises reveal → last chance → result.
- `reconnect.spec.ts` — a phone reloads mid-game, rejoins by token and keeps
  playing the same fact.
- `vip-controls.spec.ts` — the VIP skips a phase and ends the game.

## One transient stall, not reproduced

During early iteration, three runs stalled when the TV stopped receiving
`state` frames: the client screenshots showed a reveal with a `0:00` timer and a
phone stuck on "Reconnecting…". The Playwright trace recorded
`net::ERR_CONNECTION_REFUSED` for `ws://127.0.0.1:8801/ws/<CODE>` at that point,
i.e. the browser could not reach the local dev server.

At that time a manually started `wrangler dev` on the same port was still
running while `scripts/e2e-setup.mjs` deleted and recreated
`.wrangler/e2e-state` underneath it, so the stall is attributed to that
interference, not to product code. A health poll over a later full run (78
samples, 0 failures) and repeated clean runs of every spec pass, so no
`FINDINGS` entry with a failing assertion is kept.

Artifacts for any future failure land in `test-results/` (screenshot, video and
`trace.zip`; open the trace with `pnpm exec playwright show-trace <path>`).
