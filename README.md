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

Play now at **[openpartygames.org](https://openpartygames.org)**.

1. Open it on a TV or laptop and start a room.
2. Everyone else scans the QR code with their phone, or goes to [openpartygames.org/join](https://openpartygames.org/join) and types the room code.
3. The first player to join picks the game.

Want your own copy? [Run it locally](#run-it-locally) or [self-host it on Cloudflare](#self-host-on-cloudflare).

## Run it locally

You need Node 24 or newer and pnpm.

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

   Copy the `database_id` from the output into `apps/worker/wrangler.jsonc`, replacing the one checked in for openpartygames.org.

5. Point `routes` in `apps/worker/wrangler.jsonc` at a domain on your Cloudflare account, or delete `routes` to use your `workers.dev` address. Put the same address in the share tags in `apps/web/index.html` and on the share card in `scripts/build-share-images.mjs`, then run `node scripts/build-share-images.mjs` to redraw the card.

6. Apply the migrations to the remote database:

   ```sh
   pnpm --filter @opg/worker exec wrangler d1 migrations apply openpartygames --remote
   ```

7. Seed the content packs. This validates and rebuilds the seed, then loads it into D1:

   ```sh
   node scripts/build-pack-seed.mjs
   pnpm --filter @opg/worker exec wrangler d1 execute openpartygames --remote --file=.wrangler/pack-seed.sql
   ```

8. Set the rate-limit namespace ids in `apps/worker/wrangler.jsonc`. Cloudflare assigns a `namespace_id` per account and binding name; pick two distinct positive integers (the checked-in `1001` and `1002` are placeholders).

9. Set the `DAILY_ROOM_CAP` var in `apps/worker/wrangler.jsonc`. It caps how many rooms the deployment creates per day.

10. Deploy:

    ```sh
    pnpm --filter @opg/worker run deploy
    ```

Deploys restart every Durable Object and drop open sockets. Clients reconnect with their token and get their view back, so players only see a short "Reconnecting…" message.

### Deploy from GitHub Actions

The `deploy` job in `.github/workflows/ci.yml` ships every push to `main` once `pnpm check` and the e2e suites (`pnpm e2e`) pass. It applies the D1 migrations, reseeds the packs, deploys the Worker and then checks `/api/health` on the live site. Run the CI workflow by hand from the Actions tab to redeploy.

Migrations run before the new Worker goes live, so a migration must keep working with the version still running.

To turn it on in your fork, do steps 1–9 above, then:

1. Create a Cloudflare account API token with **Workers Scripts › Edit** and **D1 › Edit** on the account, plus **Zone › Read** and **Workers Routes › Edit** on your domain.
2. In your GitHub repository settings, create an environment named `production` and add the token as its `CLOUDFLARE_API_TOKEN` secret.
3. Add your Cloudflare account ID as a repository variable named `CLOUDFLARE_ACCOUNT_ID`. The deploy job is skipped while this variable is missing.
4. Change the site address in the `deploy` job (the environment `url` and the health check) to your domain.

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
scripts/             pack validation, pack seed, pack submission, icons and share card
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
