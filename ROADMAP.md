# Game roadmap

Every game we plan to build, or would love someone to build. All names are working titles.

Game mechanics are free to reuse. Names, text, art and audio from existing games are not. "Inspired by" is only there to help you picture the game.

## How games get prioritized

1. **Reuse.** A game that only needs Game SDK capabilities we already have is cheap, so it goes first.
2. **Community votes.** 👍 reactions on the game's GitHub issue.
3. **Variety.** We want a mix of bluffing, drawing, trivia, cooperative and social deduction games.

## Game SDK capabilities

What the SDK provides, or will provide. Each game below lists the capabilities it needs.

| Capability | What it covers | Arrives in |
|---|---|---|
| `rooms` | Join, VIP, kick, lock, reconnect, player list | Phase 0 |
| `timers` | Server-driven phase timers | Phase 0 |
| `turns` | Turn order, whose-turn-is-it on host and phones | Phase 1 (Imposter) |
| `packs` | Versioned, licensed content packs rated family, teen or adult | Phase 1 |
| `secret` | Per-player private info and roles | Phase 1 (Imposter) |
| `vote` | Vote on players or options, tally, reveal | Phase 1 |
| `text` | Typed answers, duplicate detection, too-close-to-the-truth check | Phase 1 (Real or Nah) |
| `no-tv` | Playing with no shared screen: every phone carries the stage above its own controls. Games opt in with `noTv` | Phase 2 |
| `canvas` | Drawing on the phone, synced to the host screen | Phase 2 |
| `chain` | Pass-along rounds where one player's output is the next player's input | Phase 2 |
| `teams` | Split the room into teams | Phase 3 |
| `dial` | Analog slider or dial input | Phase 3 |
| `rank` | Drag-to-order input | Phase 3 |
| `images` | Image content packs | Phase 3 |
| `audience` | Extra people who only vote | Later |

## Phase 1: MVP

| Game | How it plays | Inspired by | Needs |
|---|---|---|---|
| **Imposter** | Everyone gets a secret word, except the imposter, who knows their role and gets a decoy from the same family. Give clues out loud, then vote. A caught imposter can steal points by guessing the real word. | Undercover, Word Imposter | `rooms` `timers` `turns` `secret` `vote` `packs` |
| **Real or Nah** | Write a fake answer to an obscure fact, then vote for the real one. Score for finding the truth and for fooling others. | Fibbage | `rooms` `timers` `text` `vote` `packs` |

## Built after the MVP

| Game | How it plays | Inspired by | Needs |
|---|---|---|---|
| **Most Likely To** | Vote on which friend best fits the prompt, yourself included. Score by voting with the room; the TV shows who picked whom. The template to copy for your first game. | Party staple | `vote` `packs` |

## Phase 2: Drawing games

In build order. Doodle Bluff reuses Real or Nah's flow, while Quick Sketch needs live drawing sync.

| Game | How it plays | Inspired by | Needs |
|---|---|---|---|
| **Doodle Bluff** | Draw a secret prompt. Everyone else writes a fake title, then the room votes for the real one. | Drawful | `canvas` `text` `vote` |
| **Sketch Phone** | Write a phrase, the next player draws it, the next describes the drawing, and so on. The full chain replays on the host screen. | Telestrations, Gartic Phone | `canvas` `chain` `text` |
| **Quick Sketch** | One player draws on their phone, mirrored live to the host screen, while everyone races to type the answer. | Pictionary, skribbl.io | `canvas` (live) `text` |

## Phase 3 and later: candidates

Community votes decide the order.

### Mostly reuses existing capabilities

| Game | How it plays | Inspired by | Needs |
|---|---|---|---|
| **Quip Clash** | Two players answer the same funny prompt head to head; the room votes. | Quiplash | `text` `vote` `packs` |
| **Guesstimate** | Everyone estimates a number, then bets on whose guess is closest. | Wits & Wagers | `text` `vote` `packs` |
| **Two Truths** | Players submit facts about themselves; everyone else spots the lie. | Two Truths and a Lie | `text` `vote` |
| **Hot Take** | Predict what percentage of the room agrees with a statement. | Poll games | `vote` `packs` |
| **Emoji Movie** | Describe a movie or song using only emoji. | Charades | `text` `packs` |
| **Secret Location** | Everyone except the spy knows the location. Ask each other questions to find the spy. | Spyfall | `secret` `vote` `timers` `packs` |
| **Night Falls** | Werewolf/Mafia with an automated narrator and private night actions on phones. | Werewolf, Mafia | `secret` `vote` `timers` |
| **One Clue** | Co-op: everyone writes a one-word clue for a guesser, and duplicate clues cancel out. | Just One | `secret` `text` `packs` |
| **Hive Mind** | Score by matching the most common answer in the room. | Family Feud, Herd Mentality | `text` `packs` |
| **Categories** | Random letter plus a list of categories; the room vetoes weak answers. | Scattergories | `text` `vote` |
| **Mind Meld** | Two players type a word at the same time, then keep going until they type the same word. | Say the Same Thing | `text` |

### Needs new capabilities

| Game | How it plays | Inspired by | Needs |
|---|---|---|---|
| **On the Wave** | One player clues a hidden point on a spectrum; the team drags a dial to find it. | Wavelength | `dial` `teams` `packs` |
| **Codewords** | Two teams, a grid of words, one-word clues from each team's spymaster. | Codenames | `teams` `secret` |
| **Rank It** | Privately rank five items, then try to match the group's ranking. | Top Ten | `rank` `packs` |
| **Timeline** | Place events in chronological order. | Timeline | `rank` `packs` |
| **Caption Lab** | Caption an image; the room votes for the best one. | Meme caption games | `images` `text` `vote` |
| **Shirt Fight** | Draw designs, write slogans, mix them into shirts, and battle in a bracket. | Tee K.O. | `canvas` `text` `vote` |
| **Trivia Gauntlet** | Trivia where wrong answers send you to elimination minigames. | Trivia Murder Party | `text` `vote` `timers` |
| **Bomb Squad** | Co-op: one player sees the bomb, the others see pieces of the defusal manual. | Keep Talking and Nobody Explodes | `secret` `timers` |
| **Liar's Dice** | Bid on hidden dice across the table, and call bluffs. | Liar's Dice (public domain) | `secret` `turns` |
| **Fill the Blank** | Play the funniest card from your hand into a prompt; a rotating judge picks the winner. Original cards only, since Cards Against Humanity content is NonCommercial. | Apples to Apples | `secret` `vote` `packs` |

## Proposing a new game

Open a GitHub issue with:

- a working name and one paragraph of rules
- player count
- the capabilities it needs from the table above, plus anything new
- the content it needs, and where that content's license comes from

Once a maintainer accepts it, it gets a row here.
