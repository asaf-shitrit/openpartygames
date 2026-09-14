# Intent: OpenPartyGames platform and MVP

Author: Asaf Shitrit
Status: draft
Date: 2026-09-14 (all open questions resolved the same day)
Next stage: Design (Claude Design), then `spec.md`

## Problem

Party games like Jackbox work because everyone plays on the phone already in their pocket while one shared screen runs the show. But they're closed. You buy packs, you can't add or fix games, you can't translate them, and the content never grows with the people playing it.

There's no open-source equivalent that is:

- easy to play: scan a QR code, type a name, go
- easy to host: a public site, and a copy anyone can deploy
- built for contribution: new games and new content arrive by pull request

## Proposed outcome

A free, open-source party game platform at **openpartygames.org**.

- One **host screen** (a laptop, or a TV via casting or HDMI) creates a room and shows a room code, a QR code and an invite link.
- Players join from their **phone browser** by scanning the QR or typing the code. No app, no account.
- The first phone to join is the **VIP** and runs the game from their phone. The host screen is the stage, so it can sit across the room.
- The platform hosts **multiple games**. Each game is a package built on a shared, typed Game SDK, so contributors can add games.
- Game content (word pairs, facts) lives in **versioned, licensed, rated packs** in the repo.

### MVP games

Both games run a fixed length of about 15 minutes. The spec sets round counts to hit it.

**Imposter** (social deduction, spoken clues)

- Everyone gets the secret word on their phone (Giraffe). One player is the imposter: their phone says so and shows a decoy word from the same family (Zebra), which doubles as a hint.
- Players take turns giving a short clue out loud. The imposter bluffs to blend in.
- Everyone votes on their phone. The host screen runs the reveal.
- A caught imposter gets 15 seconds to type the crew's word. A correct guess steals points.
- Always one imposter. One vote per word. Nobody gets eliminated or sits out.
- Uses: per-player secret info, turn order, timers, voting, scoring, word-pair packs.

**Real or Nah** (Fibbage-style trivia bluffing)

- An obscure true fact appears with a blank.
- Every player types a believable fake answer on their phone.
- The real answer is shuffled in with the fakes, and players vote for the one they think is true.
- Points for finding the truth, and points for every player your lie fooled.
- Facts come from Wikipedia "Did you know" hooks first, plus the occasional Open Trivia DB question that works. Every fact keeps its source link.
- Uses: text input, duplicate detection (including a player accidentally typing the real answer), voting, scoring, fact packs.

### Platform features in the MVP

Rooms and players

- Create and join rooms with a 4-consonant room code (no vowels, so codes can't spell words), a QR code and an invite link. Join attempts are rate-limited per IP.
- 3 to 8 players per room. No audience mode.
- Nickname plus one of about 24 preset doodle avatars (first come, first served), each with a player color. Drawing your own avatar arrives with the Phase 2 canvas.
- A player who locks their phone, reloads the tab or drops off Wi-Fi rejoins from the same browser with their seat and score intact.
- Anyone arriving mid-game waits in the lobby and joins at the next game.
- VIP controls on the phone: pick game, pick packs, start, skip, kick, lock room, end. VIP passes to another player if the VIP leaves.

During play

- Phones always mirror the essentials (current prompt, whose turn it is, the timer), so remote players on a laggy screen-share and anyone who can't see the TV can still follow. Reveals and animations stay on the host screen.
- Each game has its own scoreboard. The winner earns a crown that stays next to their name for the rest of the room session.
- Packs are rated family, teen or adult. The lobby starts with family and teen packs selected; the VIP can switch on adult packs.
- Music and sound effects on the host screen, with a mute toggle and a credits screen.
- Deploys don't end games. Room state is saved after every change, and the host screen and phones reconnect within seconds and resume.

Around the games

- English UI and content, with every UI string extracted and every pack tagged with a language, so translations can follow without a rewrite.
- Anonymous match stats (games started and finished, player counts, active seconds per game). No PII.
- A short, plain-language privacy page.
- A daily cap on new rooms, starting at 150. When it's reached, the landing page says "We're full tonight" and links to the README's self-hosting section. Games already running are never cut off.
- A GitHub Sponsors link.

### Look and feel (brief for Claude Design)

Playful cartoon: chunky rounded type, bold flat colors, bouncy motion, doodle-style player avatars. Two surfaces, designed separately:

- **Host screen**: 16:9, readable from a couch three meters away, never needs input during play. Screens: landing and create room; lobby with a big room code, QR code, joined players with avatars and crowns; game and pack picker; every phase of both games; reveals; scoreboard with crown award; "We're full tonight"; credits.
- **Phone**: portrait, one-handed, large tap targets. Screens: join (code and name); avatar picker; lobby; VIP controls including pack ratings; each game's inputs (secret word or imposter card with decoy, clue turn, type an answer, vote, imposter's last-chance guess); mirrored prompt, turn and timer; waiting for next game; reconnecting.

Accessibility baseline for both surfaces: large host-screen text; nothing communicated by color alone (players always have a color and an avatar); WCAG 2.2 AA contrast on phones; reduced-motion respected; every audio cue has a visual equivalent.

### Success criteria

The MVP is done when all three are true:

1. **Real game night.** I host a full session on the live site with a TV and 3 to 8 phones, play both games start to finish, and nothing crashes and no player loses their seat.
2. **Contributor-ready.** The repo has CONTRIBUTING.md, the Contributor Covenant, Game SDK docs, a template game to copy, the bot-playthrough test harness, a pack schema validated in CI, the GitHub issue form that turns pack submissions into PRs, and a set of good-first-issues.
3. **Public launch.** It's announced on GitHub, Reddit and Hacker News, with join rate limits, billing alerts, the daily room cap, the privacy page, the README self-hosting section and GitHub Sponsors all live, and the trademark self-check done.

### Roadmap summary

The full game catalog is in [ROADMAP.md](../ROADMAP.md).

- **Phase 0, foundation:** rooms, Game SDK, bot-playthrough harness, pack format, host and phone app shells.
- **Phase 1, MVP:** Imposter and Real or Nah, then launch.
- **Phase 2, drawing games:** phone canvas and drawing sync (including draw-your-own avatars), then Drawful-style and telephone-style games.
- **Phase 3 and later:** ordered by community votes and by how much existing SDK each game reuses.

## Affected users and systems

Users

- **Hosts:** whoever has the laptop or TV. Setup should take under a minute.
- **Players:** friends on phones (iOS Safari, Android Chrome), often on flaky Wi-Fi, sometimes remote over a video call with the host screen shared. Families and classrooms as well as adults.
- **Contributors:** developers adding games, and non-developers submitting facts and word pairs through a GitHub form.
- **Self-hosters:** people following the README to run their own copy on their own Cloudflare account.
- **Maintainers:** me at launch, then contributors promoted to maintain an area (a game, content packs).

Systems

- **Cloudflare Workers:** serves the host and phone apps as static assets, plus the HTTP API.
- **Cloudflare Durable Objects:** one per room. Holds live game state in its SQLite storage and the WebSocket connections for the host screen and phones, using the WebSocket Hibernation API. This is required because D1 can't push real-time updates.
- **Cloudflare D1:** content packs (git is the source of truth; deploys seed D1), anonymous match stats and the daily room counter. Later: prompt ratings, then saved custom packs.
- **Cloudflare Web Analytics:** cookieless page analytics.
- **GitHub:** repo, issues, PRs, CI (typecheck, unit tests, bot playthroughs, pack validation), production deploys on merge to main, the Action that turns pack-submission issues into PRs, and Sponsors.
- **Content sources:** Wikipedia "Did you know" hooks and Open Trivia DB (both CC BY-SA 4.0); CC0 and CC BY audio.

## Constraints

Technical

- TypeScript everywhere, running on the Workers runtime with `nodejs_compat`. Node.js and npm are the local toolchain only; there is no long-running Node server.
- React and Vite for the host and phone apps.
- Cloudflare only (Workers, Durable Objects, D1), on my existing Workers Paid plan. Rooms must hibernate when idle, and WebSocket message volume per round must stay bounded.
- Game state is server-authoritative. A phone only ever receives its own secrets, so opening devtools can't reveal who the imposter is or which answer is real.
- Room state is persisted to the Durable Object's storage after every change, because every deploy restarts all Durable Objects and drops their WebSockets. Clients reconnect and resume automatically; if the message protocol changed, they reload at the next game boundary.
- Merging to main deploys straight to production. Branch protection requires CI to pass, and D1 migrations must stay compatible with the version still running.
- Games are packages in the monorepo (`games/<name>/`) built on the Game SDK. No third-party code loaded at runtime.
- Every game ships unit tests for its rules and a CI bot playthrough: a full game with 3 bots and with 8 bots, including a bot that disconnects and rejoins. No game merges without it.
- Every game runs at the platform's fixed standard length (about 15 minutes).
- Works in mobile browsers with no install, and on a host screen cast from a browser tab, over AirPlay or via HDMI.
- Any PR that changes setup or deploy steps updates the README self-hosting section in the same PR.

Product

- 3 to 8 players. Nickname only. No accounts, no PII stored, no cookies.
- No filtering of player text. Player text is visible only inside the room and is never persisted. The VIP can kick players and lock the room.
- Packs carry a family, teen or adult rating. Adult packs are off unless the VIP turns them on.
- Always free to play. No ads, no paywalled games. Donations through GitHub Sponsors only.
- English at launch, i18n-ready.
- Accessibility baseline as described in the design brief.

Cost

- Out-of-pocket ceiling of $5 to $10 a month until donations cover more.
- Cloudflare billing alerts go to me.
- The daily new-room cap starts at 150. The math: a Durable Object awake for an entire 15-minute game uses about 112 GB-s (128 MB × 900 s). The plan's 400,000 included GB-s plus $5 of overage covers about 235 full games a day. A room that averages two games at 150 rooms a day would come to about $12.50 a month in the absolute worst case. Rooms won't actually stay awake the whole game, though: they hibernate between messages, and Imposter's spoken clue rounds send almost none. Once real per-game active seconds are in D1, adjust the cap to match actual cost. Running games are never cut off.

Legal, licensing and community

- Code is AGPL-3.0.
- Content packs are CC BY-SA 4.0 by default, which matches the Wikipedia- and Open Trivia DB-derived packs, so everything can be mixed. Every pack declares its license and rating, and every fact keeps its source.
- Audio is CC0, or CC BY with attribution on the in-app credits screen and in the repo.
- Contributions are inbound = outbound: code under AGPL-3.0, packs under their declared license. No DCO, no CLA.
- Code of conduct: Contributor Covenant, with me as the enforcement contact.
- Only I can merge at launch. CONTRIBUTING.md documents how active contributors get promoted to maintain an area.
- Before launch, I self-check USPTO and EUIPO in classes 9 and 41 for "OpenPartyGames", "Imposter" and "Real or Nah", and rename anything with a live conflicting mark. Never use "Imposter Party", which is a registered trademark.
- No Jackbox names, text, art or audio. No NonCommercial-licensed content (for example, Cards Against Humanity's CC BY-NC-SA cards). Game mechanics can be reused; names, text and art can't. "Inspired by" references are fine in docs.

## Decided during intake

| Topic | Decision | Why |
|---|---|---|
| **Games** | | |
| Imposter clues | Spoken aloud; phones show the secret word and handle voting | Fastest to build; works over voice calls |
| Imposter secret | The imposter knows their role and gets a decoy word from the same family | Plays as bluffing; the decoy doubles as a hint |
| Imposter count | Always one | Simplest scoring and reveal |
| Imposter structure | One vote per word, no elimination | Nobody sits out at a party |
| Imposter comeback | A caught imposter gets 15 seconds to guess the crew's word and steal points | Keeps the imposter in it; great TV moment |
| Game names | Imposter and Real or Nah | Instantly understood; no conflicting game found for Real or Nah |
| Fact sources | Wikipedia "Did you know" hooks first, Open Trivia DB for the questions that fit | DYK facts are surprising by design; most OTDB questions are too well known |
| Game length | Fixed, about 15 minutes | One less setting to design and test |
| Scores | Per-game scoreboard; winner gets a crown for the room session | Bragging rights without mixing scoring scales |
| Phase 2 | Drawing games | Chosen next game family |
| **Rooms and players** | | |
| Setting | Same room first; remote works by sharing the host screen on a video call | Couch play is the core experience |
| Room size | 3 to 8, no audience | Both games play best in this range |
| Controls | First phone to join is VIP | The host screen may be across the room |
| Room code | 4 consonants, join attempts rate-limited per IP | Can't spell words, easy to shout, impractical to guess |
| Late joins | Wait in the lobby for the next game | No approval step; VIP can still lock or kick |
| Phone mirroring | Prompt, whose turn and timer on every phone; reveals stay on the host screen | Remote players and people who can't see the TV can follow |
| Accounts | None; nickname plus a reconnect token in the browser | Zero friction at a party |
| Avatars | About 24 preset doodles with player colors; draw-your-own in Phase 2 | Cartoon charm without pulling canvas work into the MVP |
| Moderation | No text filtering; VIP can kick | Private rooms among friends |
| Content ratings | Packs tagged family, teen or adult; adult off by default | Families and classrooms can trust the defaults |
| **Look, sound and access** | | |
| Visual direction | Playful cartoon | Warm and approachable |
| Audio | Music and SFX with mute | Most of the party feel for little effort |
| Audio licenses | CC0, or CC BY with a credits screen | Far bigger music library than CC0 alone |
| Accessibility | Party-readable baseline: large text, never color alone, AA contrast on phones, reduced motion, visual cue for every sound | Readable across a room without a formal audit per game |
| Languages | English, i18n-ready | Translations later without a rewrite |
| **Stack and operations** | | |
| Language | TypeScript on the Workers runtime | Shared types across server, host and phone matter for contributors |
| Frontend | React and Vite | Claude Design handoffs arrive as HTML/React; largest contributor pool |
| Hosting | Existing Workers Paid plan | Already paid for |
| D1 contents | MVP: content packs, anonymous stats, room counter. v1: prompt ratings. Later: saved custom packs | Public user-made packs without filtering are an abuse risk |
| Releases | Merge to main deploys to production | Fastest path; CI and bot playthroughs are the gate |
| Deploy survival | Room state persisted after every change; clients auto-resume | Deploys restart every Durable Object |
| Game proof | Unit tests plus CI bot playthroughs with 3 and 8 bots, including a disconnect and rejoin | Contributors and Claude can prove a game works without gathering friends |
| Domain | openpartygames.org | .com is taken and offline; .org fits a donation-funded project |
| Analytics | Cloudflare Web Analytics plus anonymous match stats in D1 | Cookieless, no consent banner |
| Privacy | Short plain-language privacy page at launch | Trust with strangers from Reddit and HN |
| Cost ceiling | $5 to $10 a month; billing alerts; daily new-room cap starting at 150, tuned from measured usage | Conservative start while real costs are unknown; running games are never cut off |
| Self-hosting | README deploy section, linked from "We're full tonight" | Least to maintain at launch |
| **Open source** | | |
| Code license | AGPL-3.0 | Stops closed forks run as a hosted service |
| Pack license | CC BY-SA 4.0 by default | Matches derived packs, so content mixes freely |
| Contributor terms | Inbound = outbound, no DCO or CLA | Zero friction |
| Code of conduct | Contributor Covenant | The standard; GitHub recognizes it |
| Maintainers | Only me at launch, with a documented path to area maintainers | Avoids becoming the bottleneck later |
| Adding games | Packages in the monorepo on a typed Game SDK | Reviewed, secure, one deploy |
| Pack contributions | GitHub issue form; an Action validates it and opens a PR | Non-developers never touch git; no hosting |
| Trademark check | Self-check USPTO and EUIPO (classes 9 and 41) before launch | Proportionate for a free, non-commercial project |
| Project name | OpenPartyGames | No conflicting game or trademark found |
| Money | Donations only, through GitHub Sponsors | Always free to play; no platform fee |

## Open questions

None. Everything raised during intake is decided above.

## Next steps

1. Register openpartygames.org.
2. Review this intent, correct anything wrong, set `Status: accepted`, and commit it.
3. **Design:** mock the host screen and phone flows in Claude Design from this file, iterate, then export the handoff to Claude Code.
4. **Spec:** write `spec.md` covering requirements, scoring and round counts for both games, the Game SDK contract, the room message protocol, the pack schema, and flagged concerns.
5. **Build:** run Claude Code in plan mode to produce `plan.md`, plus a `CLAUDE.md` with build, test and verify commands (including the bot playthroughs).
6. **Before launch:** run the trademark self-check. After launch, adjust the room cap from the first weeks of measured active seconds per game.
