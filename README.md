# OpenPartyGames

OpenPartyGames is a free, open-source party game platform. One screen — a laptop or a TV — runs the show. Everyone else plays from their phone browser. No app, no account, no login.

- The host screen creates a room and shows a room code, a QR code and an invite link.
- Players join by scanning the QR code or typing the code, then pick a name and an avatar.
- The first player to join is the VIP and drives the game from their phone, so the host screen can sit across the room.
- Rooms hold 3 to 8 players. Everyone plays; nobody sits out.

Two games are in the MVP:

- **Imposter** — everyone gets a secret word on their phone except the imposter, who knows their role and sees a decoy word. Give clues out loud, then vote.
- **Real or Nah** — an obscure fact with a blank. Everyone writes a believable fake answer, then the room votes for the one that's true.

Game content lives in versioned, licensed, rated packs in this repo. Code is AGPL-3.0, packs are CC BY-SA 4.0 by default. See [LICENSE](LICENSE).

## Play

There is no hosted instance yet. The public site at openpartygames.org arrives with the launch. Until then, run it locally or self-host it.

## Run it locally

You need Node 22 or newer and pnpm.

```sh
pnpm install
pnpm --filter @opg/worker db:migrate:local
pnpm --filter @opg/worker db:seed:local
pnpm dev
```

Open <http://localhost:5173> on a laptop. On phones on the same network, open the laptop's LAN address (for example `http://192.168.1.42:5173`) and join with the room code from the host screen.

The dev server runs Vite on port 5173 and `wrangler dev` on port 8787; Vite proxies API and WebSocket traffic to the Worker.

## Self-host on Cloudflare

OpenPartyGames runs on Cloudflare Workers, Durable Objects and D1.

1. Create a Cloudflare account if you don't have one.
2. Durable Objects require the Workers Paid plan ($5/month) on most accounts. Free accounts have Durable Object access only on the free tier's limits, which are too low for a room with live timers. Check the current limits and plan before you start.
3. Log in:

   ```sh
   pnpm --filter @opg/worker exec wrangler login
   ```

4. Create the D1 database:

   ```sh
   pnpm --filter @opg/worker exec wrangler d1 create openpartygames
   ```

   Copy the `database_id` from the output into `apps/worker/wrangler.jsonc`, replacing the placeholder.

5. Apply the migrations to the remote database:

   ```sh
   pnpm --filter @opg/worker exec wrangler d1 migrations apply openpartygames --remote
   ```

6. Seed the content packs. This validates and rebuilds the seed, then loads it into D1:

   ```sh
   node scripts/build-pack-seed.mjs
   pnpm --filter @opg/worker exec wrangler d1 execute openpartygames --remote --file=.wrangler/pack-seed.sql
   ```

7. Set the rate-limit namespace ids in `apps/worker/wrangler.jsonc`. Cloudflare assigns a `namespace_id` per account and binding name; pick two distinct positive integers (the checked-in `1001` and `1002` are placeholders).

8. Set the `DAILY_ROOM_CAP` var in `apps/worker/wrangler.jsonc`. It caps how many rooms the deployment creates per day.

9. Deploy:

   ```sh
   pnpm --filter @opg/worker deploy
   ```

Deploys restart every Durable Object and drop open sockets. Clients reconnect with their token and get their view back, so players only see a short "Reconnecting…" message.

## Project layout

```text
apps/web/            React + Vite app: host stage (TV) and phone UI
apps/worker/         Worker entry, Room Durable Object, D1 migrations, wrangler.jsonc
packages/protocol/   Wire types and parseClientMessage
packages/sdk/        Game SDK types, seeded rng, RoomCore, testing harness
packages/ui/         Doodle Notebook UI kit: tokens, fonts, components, avatars
games/imposter/      Imposter rules and Host/Phone UI
games/real-or-nah/   Real or Nah rules and Host/Phone UI
packs/imposter/      word-pair packs (JSON)
packs/real-or-nah/   fact packs (JSON)
scripts/             pack validation, pack seed, pack submission
```

## Quality gates

Every change must pass `pnpm check`, which runs:

- `pnpm validate:packs` — pack JSON is valid, licensed and complete
- `pnpm lint` — Oxlint, type-aware, with the anti-slop plugin; warnings fail
- `pnpm typecheck` — every workspace
- `pnpm test` — Vitest, one project per workspace, including bot playthroughs
- `pnpm crap` — CRAP score at most 8 per function
- `pnpm build` — the web bundle

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Content packs can be submitted without touching git, through a GitHub issue form.

- Roadmap: [ROADMAP.md](ROADMAP.md)
- Code license: [LICENSE](LICENSE) (AGPL-3.0)
- Pack license: CC BY-SA 4.0 by default, declared per pack
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## Donations

OpenPartyGames is always free to play. There are no ads and no paywalled games. Donations go through GitHub Sponsors: [GITHUB SPONSORS URL]
