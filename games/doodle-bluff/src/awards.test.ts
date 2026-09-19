import { describe, expect, it } from "vitest";
import { doodleBluffAwards } from "./awards";
import type { DoodleRoundRecord, DoodleState } from "./state";

function baseState(overrides: Partial<DoodleState> = {}): DoodleState {
  return {
    phase: "gallery",
    playerIds: ["artist1", "artist2", "voter1", "voter2"],
    drawings: {},
    drawOrder: [],
    queueOrder: [],
    queuePos: 0,
    shownCount: 0,
    plannedRounds: 0,
    currentDrawingId: null,
    titles: {},
    titleErrors: {},
    options: null,
    votes: {},
    reveal: null,
    pointsThisRound: {},
    scores: {},
    finished: true,
    deadline: null,
    history: [],
    ...overrides,
  };
}

function record(overrides: Partial<DoodleRoundRecord> = {}): DoodleRoundRecord {
  return { drawingId: "d1", artistId: "artist1", foundByIds: [], titles: [], ...overrides };
}

describe("doodleBluffAwards", () => {
  it("pen-of-the-people goes to the artist most people found", () => {
    const state = baseState({
      history: [
        record({ drawingId: "a1", artistId: "artist1", foundByIds: ["voter1", "voter2"] }),
        record({ drawingId: "a2", artistId: "artist1", foundByIds: ["voter1"] }),
      ],
    });
    const awards = doodleBluffAwards(state);
    const award = awards.find((a) => a.id === "pen-of-the-people");
    expect(award?.playerIds).toEqual(["artist1"]);
    expect(award?.value).toBe(3);
  });

  it("master-forger goes to the fake-title author who fooled the most people", () => {
    const state = baseState({
      history: [
        record({ titles: [{ authorId: "artist2", fooledIds: ["voter1", "voter2"] }] }),
      ],
    });
    const awards = doodleBluffAwards(state);
    const award = awards.find((a) => a.id === "master-forger");
    expect(award?.playerIds).toEqual(["artist2"]);
    expect(award?.value).toBe(2);
  });

  it("sharp-eye goes to whoever found the real title the most times", () => {
    const state = baseState({
      history: [
        record({ drawingId: "a1", foundByIds: ["voter1"] }),
        record({ drawingId: "a2", foundByIds: ["voter1"] }),
      ],
    });
    const award = doodleBluffAwards(state).find((a) => a.id === "sharp-eye");
    expect(award?.playerIds).toEqual(["voter1"]);
    expect(award?.value).toBe(2);
  });

  it("abstract-artist goes to whoever drew the one nobody guessed", () => {
    const state = baseState({
      history: [
        record({
          artistId: "artist1",
          foundByIds: [],
          titles: [{ authorId: "artist2", fooledIds: ["voter1", "voter2"] }],
        }),
      ],
    });
    const award = doodleBluffAwards(state).find((a) => a.id === "abstract-artist");
    expect(award?.playerIds).toEqual(["artist1"]);
    expect(award?.value).toBe(2);
  });

  it("excludes a kicked player's history from every award", () => {
    const state = baseState({
      playerIds: ["artist2", "voter1", "voter2"], // artist1 was kicked
      history: [record({ artistId: "artist1", foundByIds: ["voter1", "voter2"] })],
    });
    const award = doodleBluffAwards(state).find((a) => a.id === "pen-of-the-people");
    expect(award).toBeUndefined();
  });

  it("returns no award for a threshold nobody reaches", () => {
    const state = baseState({ history: [record({ foundByIds: ["voter1"] })] });
    expect(doodleBluffAwards(state)).toEqual([]);
  });

  it("caps at MAX_AWARDS", () => {
    const state = baseState({
      history: [
        record({ drawingId: "a1", artistId: "artist1", foundByIds: ["voter1", "voter2"] }),
        record({ drawingId: "a2", artistId: "artist1", foundByIds: ["voter1", "voter2"] }),
        record({
          drawingId: "a3",
          artistId: "artist2",
          foundByIds: [],
          titles: [{ authorId: "voter1", fooledIds: ["voter2", "artist1"] }],
        }),
        record({ drawingId: "a4", foundByIds: ["voter2", "voter1"] }),
      ],
    });
    const awards = doodleBluffAwards(state);
    expect(awards.length).toBeLessThanOrEqual(3);
  });
});
