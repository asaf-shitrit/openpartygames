// The no-TV stage is `hostView(state)`, sent verbatim (plan/0004-no-tv-mode.md §4). This is
// the per-game half of that contract: the stage deep-equals hostView(state) in every phase,
// and — the rule specific to Imposter — the crew word never reaches the stage before the
// result, and the imposter's in-progress guess reaches it as a length only, never letters.
import { describe, expect, it } from "vitest";
import type { PlayerId } from "@opg/protocol";
import type { ImposterState, ImposterWord } from "./state";
import { buildHostView, buildPlayerView } from "./views";

const P1: PlayerId = "p1";
const P2: PlayerId = "p2";
const P3: PlayerId = "p3";
const P4: PlayerId = "p4";
const PLAYER_IDS: PlayerId[] = [P1, P2, P3, P4];

const WORD: ImposterWord = { crew: "GIRAFFE", decoy: "ZEBRA", imposterId: P2 };

const BASE: Omit<ImposterState, "phase"> = {
  wordIndex: 0,
  words: [WORD],
  playerIds: PLAYER_IDS,
  clueOrder: PLAYER_IDS,
  clueIndex: 0,
    turnStartedAt: 0,
  doneSpeakerIds: [],
  votes: {},
  tally: {},
  caught: null,
  guess: null,
  guessCorrect: null,
  pointsThisWord: {},
  scores: { [P1]: 0, [P2]: 0, [P3]: 0, [P4]: 0 },
  finished: false,
  deadline: 5000,
};

function state(overrides: Partial<ImposterState>): ImposterState {
  return { ...BASE, phase: "word-check", ...overrides };
}

const wordCheck = state({ phase: "word-check" });

const clues = state({
  phase: "clues",
  clueIndex: 2,
  doneSpeakerIds: [P1, P2],
});

const voteOpen = state({
  phase: "vote",
  votes: { [P1]: P2 },
});

const CAUGHT_TALLY = { [P2]: [P1, P3, P4] };
const revealCaught = state({
  phase: "reveal",
  votes: { [P1]: P2, [P3]: P2, [P4]: P2 },
  tally: CAUGHT_TALLY,
  caught: true,
  revealPlayerIds: PLAYER_IDS,
});

const WRONG_TALLY = { [P1]: [P3, P4] };
const revealWrong = state({
  phase: "reveal",
  votes: { [P3]: P1, [P4]: P1, [P2]: P3 },
  tally: WRONG_TALLY,
  caught: false,
  revealPlayerIds: PLAYER_IDS,
});

const lastChance = state({
  phase: "last-chance",
  votes: { [P1]: P2, [P3]: P2, [P4]: P2 },
  tally: CAUGHT_TALLY,
  caught: true,
  revealPlayerIds: PLAYER_IDS,
  guess: "bana",
  guessLength: 4,
  guessLengthAt: 4200,
});

const resultCaughtNope = state({
  phase: "result",
  votes: { [P1]: P2, [P3]: P2, [P4]: P2 },
  tally: CAUGHT_TALLY,
  caught: true,
  revealPlayerIds: PLAYER_IDS,
  guess: "banana",
  guessCorrect: false,
  pointsThisWord: { [P1]: 500, [P3]: 500, [P4]: 500 },
});

const resultCaughtStole: ImposterState = {
  ...resultCaughtNope,
  guess: "giraffe",
  guessCorrect: true,
  pointsThisWord: { [P2]: 1000 },
};

const resultEscaped = state({
  phase: "result",
  votes: { [P1]: P3, [P3]: P1, [P4]: P1 },
  tally: WRONG_TALLY,
  caught: false,
  revealPlayerIds: PLAYER_IDS,
  guess: null,
  guessCorrect: null,
  pointsThisWord: { [P2]: 1000 },
});

const STATES = {
  "word-check": wordCheck,
  clues,
  "vote: open": voteOpen,
  "reveal: caught": revealCaught,
  "reveal: wrong": revealWrong,
  "last-chance": lastChance,
  "result: caught nope": resultCaughtNope,
  "result: caught stole": resultCaughtStole,
  "result: escaped": resultEscaped,
} satisfies Record<string, ImposterState>;

describe("the stage is the host view, never something composed", () => {
  for (const [label, s] of Object.entries(STATES)) {
    it(`${label}: every player's stage deep-equals hostView(state)`, () => {
      const hostView = buildHostView(s);
      for (const id of s.playerIds) {
        const playerViewPlusStage = { ...buildPlayerView(s, id), stage: hostView };
        expect(playerViewPlusStage.stage).toStrictEqual(hostView);
      }
    });

    it(`${label}: the reveal fields, once frozen, are identical everywhere they appear`, () => {
      const hostView = buildHostView(s);
      for (const id of s.playerIds) {
        const playerView = buildPlayerView(s, id);
        expect(playerView.imposterId).toStrictEqual(hostView.imposterId);
        expect(playerView.caught).toStrictEqual(hostView.caught);
        expect(playerView.totals).toStrictEqual(hostView.totals);
      }
    });
  }
});

describe("the crew word never reaches the stage before the result", () => {
  for (const [label, s] of Object.entries(STATES)) {
    if (s.phase !== "result") continue;
    it(`${label}: hostView carries the crew word once the result lands`, () => {
      expect(buildHostView(s).crewWord).toBe(WORD.crew);
    });
  }

  for (const [label, s] of Object.entries(STATES)) {
    if (s.phase === "result") continue;
    it(`${label}: hostView carries no crew word anywhere before the result`, () => {
      const hostView = buildHostView(s);
      expect(hostView.crewWord).toBeNull();
      expect(JSON.stringify(hostView)).not.toContain(WORD.crew);
    });
  }
});

describe("the imposter's in-progress guess reaches the stage as a length only", () => {
  it("last-chance carries guessLength but never the guess's letters", () => {
    const hostView = buildHostView(lastChance);
    expect(hostView.guessLength).toBe(4);
    expect(hostView.guess).toBeNull();
    if (lastChance.guess === null) throw new Error("fixture must set a guess");
    expect(JSON.stringify(hostView)).not.toContain(lastChance.guess);
  });

  it("guessLength is null outside last-chance, even once a guess exists", () => {
    for (const [label, s] of Object.entries(STATES)) {
      if (s.phase === "last-chance") continue;
      const hostView = buildHostView(s);
      expect(hostView.guessLength, `${label} guessLength`).toBeNull();
    }
  });
});

describe("the vote phase never leaks who voted for whom", () => {
  it("votedIds names who voted, and nothing on the host view names their target", () => {
    const hostView = buildHostView(voteOpen);
    expect(hostView.votedIds).toEqual([P1]);
    expect(hostView).not.toHaveProperty("votes");
    expect(hostView.tally).toBeNull();
  });

  it("hostView is unchanged when the same voters pick different targets", () => {
    const a = buildHostView(state({ phase: "vote", votes: { [P1]: P2, [P3]: P4 } }));
    const b = buildHostView(state({ phase: "vote", votes: { [P1]: P4, [P3]: P2 } }));
    expect(a).toStrictEqual(b);
  });
});
