// Full-room playthroughs through the SDK's bot harness. The harness module
// (@opg/sdk/testing) is written by a parallel task; it is imported lazily so this
// file typechecks before that module lands. Run it once @opg/sdk/testing is present.
import { describe, expect, it } from "vitest";
import type {
  FactContent,
  PlaythroughOptions,
  PlaythroughResult,
} from "@opg/sdk";
import { realOrNah } from "./index";

const TESTING_SPECIFIER: string = "@opg/sdk/testing";

interface TestingHarness {
  runBotPlaythrough: (options: PlaythroughOptions) => PlaythroughResult;
}

async function loadTestingHarness(): Promise<TestingHarness> {
  // The specifier is not a literal, so TS types the dynamic import as `any`; the
  // annotation is the assertion that it matches the harness module's contract.
  const harness: TestingHarness = await import(TESTING_SPECIFIER);
  return harness;
}

const CONTENT: FactContent = {
  kind: "facts",
  items: [
    {
      id: "emu-war",
      prompt: "In 1932, the Australian army went to war against ____ and lost.",
      answer: "emus",
      alternates: ["emu"],
      decoys: ["kangaroos", "rabbits", "cane toads"],
      source: {
        title: "Emu War",
        url: "https://en.wikipedia.org/wiki/Emu_War",
      },
    },
    {
      id: "scotland-unicorn",
      prompt: "Scotland's national animal is the ____.",
      answer: "unicorn",
      alternates: ["unicorns"],
      decoys: ["red deer", "golden eagle", "highland cow"],
      source: {
        title: "National symbols of Scotland",
        url: "https://en.wikipedia.org/wiki/National_symbols_of_Scotland",
      },
    },
    {
      id: "wombat-cubes",
      prompt: "Wombats are famous for pooping little ____.",
      answer: "cubes",
      alternates: ["cube"],
      decoys: ["stars", "spirals", "pyramids"],
      source: { title: "Wombat", url: "https://en.wikipedia.org/wiki/Wombat" },
    },
    {
      id: "octopus-hearts",
      prompt: "An octopus has ____ hearts.",
      answer: "three",
      alternates: ["3"],
      decoys: ["two", "five", "nine"],
      source: {
        title: "Octopus",
        url: "https://en.wikipedia.org/wiki/Octopus",
      },
    },
    {
      id: "venus-day",
      prompt: "On Venus, a single day lasts longer than a ____.",
      answer: "year",
      alternates: ["year on venus"],
      decoys: ["decade", "century", "month"],
      source: { title: "Venus", url: "https://en.wikipedia.org/wiki/Venus" },
    },
    {
      id: "sharks-trees",
      prompt: "Sharks have existed for longer than ____ have.",
      answer: "trees",
      alternates: ["tree"],
      decoys: ["jellyfish", "sponges", "the Moon"],
      source: { title: "Shark", url: "https://en.wikipedia.org/wiki/Shark" },
    },
    {
      id: "banana-radioactive",
      prompt:
        "Bananas are very slightly ____ because of the potassium in them.",
      answer: "radioactive",
      alternates: [],
      decoys: ["magnetic", "electric", "glowing"],
      source: {
        title: "Banana equivalent dose",
        url: "https://en.wikipedia.org/wiki/Banana_equivalent_dose",
      },
    },
    {
      id: "google-backrub",
      prompt:
        "Before it was called Google, Larry Page and Sergey Brin's search engine was nicknamed ____.",
      answer: "BackRub",
      alternates: ["back rub"],
      decoys: ["Googol", "PageFinder", "LinkLoop"],
      source: {
        title: "History of Google",
        url: "https://en.wikipedia.org/wiki/History_of_Google",
      },
    },
  ],
};

describe("real-or-nah bot playthroughs", () => {
  for (const players of [3, 8]) {
    it(`finishes a ${players}-player game with a mid-game disconnect and rejoin`, async () => {
      const { runBotPlaythrough } = await loadTestingHarness();
      const result = runBotPlaythrough({
        game: realOrNah,
        content: CONTENT,
        players,
        seed: 1000 + players,
        disconnectRejoin: true,
      });

      expect(result.finished).toBe(true);
      expect(result.steps).toBeGreaterThan(0);
      expect(Object.keys(result.scores)).toHaveLength(players);
      expect(result.winnerIds.length).toBeGreaterThan(0);
      expect(result.rejoinedPlayerId).not.toBeNull();
    });
  }
});
