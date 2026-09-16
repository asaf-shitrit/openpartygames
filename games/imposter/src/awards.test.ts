import { describe, expect, it } from "vitest";
import type { PlayerId } from "@opg/protocol";
import { imposterAwards } from "./awards";
import type { ImposterState, ImposterWordRecord } from "./state";

function record(patch: Partial<ImposterWordRecord> = {}): ImposterWordRecord {
  return {
    playerIds: ["p1", "p2", "p3", "p4"],
    imposterId: "p1",
    votes: {},
    caught: false,
    guessCorrect: false,
    ...patch,
  };
}

function state(
  history: ImposterWordRecord[],
  playerIds: PlayerId[] = ["p1", "p2", "p3", "p4"],
): ImposterState {
  return {
    phase: "result",
    wordIndex: history.length,
    words: [],
    playerIds,
    clueOrder: [],
    clueIndex: 0,
    doneSpeakerIds: [],
    votes: {},
    tally: {},
    caught: null,
    guess: null,
    guessCorrect: null,
    pointsThisWord: {},
    scores: {},
    finished: false,
    deadline: null,
    history,
  };
}

describe("imposterAwards", () => {
  it("returns nothing when there is no history", () => {
    expect(imposterAwards(state([]))).toEqual([]);
  });

  it("word-thief goes to an imposter caught but who still guessed the word", () => {
    const history = [
      record({ imposterId: "p1", caught: true, guessCorrect: true }),
    ];
    expect(imposterAwards(state(history))).toContainEqual({
      id: "word-thief",
      playerIds: ["p1"],
      value: 1,
    });
  });

  it("does not award word-thief for a caught wrong guess", () => {
    const history = [
      record({ imposterId: "p1", caught: true, guessCorrect: false }),
    ];
    expect(imposterAwards(state(history))).not.toContainEqual(
      expect.objectContaining({ id: "word-thief" }),
    );
  });

  it("master-of-disguise counts words the imposter escaped, threshold at 1", () => {
    const history = [record({ imposterId: "p2", caught: false })];
    expect(imposterAwards(state(history))).toContainEqual({
      id: "master-of-disguise",
      playerIds: ["p2"],
      value: 1,
    });
  });

  it("ties share word-thief and master-of-disguise", () => {
    const history = [
      record({ imposterId: "p1", caught: true, guessCorrect: true }),
      record({ imposterId: "p2", caught: true, guessCorrect: true }),
    ];
    expect(imposterAwards(state(history))).toContainEqual({
      id: "word-thief",
      playerIds: ["p1", "p2"],
      value: 1,
    });
  });

  it("sharpest-eye requires at least 2 votes for the imposter, just below threshold gets nothing", () => {
    const history = [record({ imposterId: "p1", votes: { p2: "p1" } })];
    expect(imposterAwards(state(history))).not.toContainEqual(
      expect.objectContaining({ id: "sharpest-eye" }),
    );
  });

  it("ignores a vote for someone other than the imposter and a kicked voter", () => {
    const history = [
      record({
        imposterId: "p1",
        votes: { p2: "p3", ghost: "p1" },
      }),
    ];
    expect(imposterAwards(state(history))).not.toContainEqual(
      expect.objectContaining({ id: "sharpest-eye" }),
    );
  });

  it("sharpest-eye at threshold awards the voter", () => {
    const history = [
      record({ imposterId: "p1", votes: { p2: "p1" } }),
      record({ imposterId: "p3", votes: { p2: "p3" } }),
    ];
    expect(imposterAwards(state(history))).toContainEqual({
      id: "sharpest-eye",
      playerIds: ["p2"],
      value: 2,
    });
  });

  it("trusted-crew requires 3 words with zero votes against, just below threshold gets nothing", () => {
    const history = [
      record({ imposterId: "p1", votes: {} }),
      record({ imposterId: "p1", votes: {} }),
    ];
    expect(imposterAwards(state(history))).not.toContainEqual(
      expect.objectContaining({ id: "trusted-crew" }),
    );
  });

  it("trusted-crew at threshold awards crew nobody suspected", () => {
    const history = [
      record({ imposterId: "p1", votes: {} }),
      record({ imposterId: "p1", votes: {} }),
      record({ imposterId: "p1", votes: {} }),
    ];
    // p1 is the imposter every time so is excluded; p2, p3, p4 each get zero votes.
    expect(imposterAwards(state(history))).toContainEqual({
      id: "trusted-crew",
      playerIds: ["p2", "p3", "p4"],
      value: 3,
    });
  });

  it("excludes a kicked player from every tally even if history still mentions them", () => {
    const history = [
      record({ imposterId: "p1", caught: true, guessCorrect: true }),
    ];
    // p1 was kicked after the word was scored; the current roster no longer has them.
    const s = state(history, ["p2", "p3", "p4"]);
    expect(imposterAwards(s)).toEqual([]);
  });

  it("orders the awards best first and caps the list at MAX_AWARDS", () => {
    const history = [
      record({ imposterId: "p1", caught: true, guessCorrect: true, votes: {} }),
      record({
        imposterId: "p2",
        caught: false,
        votes: { p3: "p2", p4: "p2" },
      }),
      record({ imposterId: "p1", caught: false, votes: {} }),
      record({ imposterId: "p4", caught: false, votes: { p3: "p4" } }),
    ];
    const ids = imposterAwards(state(history)).map((a) => a.id);
    expect(ids).toEqual(["word-thief", "master-of-disguise", "sharpest-eye"]);
  });

  it("awards trusted crew to the players nobody voted for", () => {
    const history = [
      record({ imposterId: "p1", caught: true, guessCorrect: false }),
      record({ imposterId: "p1", caught: true, guessCorrect: false }),
      record({ imposterId: "p1", caught: true, guessCorrect: false }),
    ];
    expect(imposterAwards(state(history)).map((a) => a.id)).toContain(
      "trusted-crew",
    );
  });

  it("drops the fourth award type, so a game never shows more than three", () => {
    const history = [
      record({ imposterId: "p1", caught: true, guessCorrect: true }),
      record({
        imposterId: "p2",
        caught: false,
        votes: { p3: "p2", p4: "p2" },
      }),
      record({ imposterId: "p2", caught: false, votes: { p3: "p2" } }),
      record({ imposterId: "p1", caught: false, votes: {} }),
      record({ imposterId: "p1", caught: false, votes: {} }),
      record({ imposterId: "p1", caught: false, votes: {} }),
    ];
    const ids = imposterAwards(state(history)).map((a) => a.id);
    expect(ids).toEqual(["word-thief", "master-of-disguise", "sharpest-eye"]);
  });
});
