import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUDIO_CREDITS, MUSIC_CREDITS } from "../packages/ui/src/audio/credits";
import { CUE_IDS, MUSIC_IDS } from "../packages/ui/src/audio/types";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const audioDir = path.join(rootDir, "apps/web/public/audio");
const LICENSES = ["CC0-1.0", "CC-BY-3.0", "CC-BY-4.0"];
const CUE_MAX_BYTES = 80 * 1024;
const MUSIC_MAX_BYTES = 1.7 * 1024 * 1024;

/** An mp3 either starts with an ID3 tag or with a sync frame (0xFFEx). */
const looksLikeMp3 = (file: string): boolean => {
  const head = fs.readFileSync(file).subarray(0, 3);
  const isId3 = head.toString("latin1") === "ID3";
  const isFrame = (head[0] ?? 0) === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0;
  return isId3 || isFrame;
};

function expectLicensed(entry: {
  file: string;
  author: string;
  license: string;
  sourceUrl: string;
  assetUrl: string;
}): void {
  expect(LICENSES, `${entry.file} has license ${entry.license}`).toContain(
    entry.license,
  );
  expect(entry.author.length, `${entry.file} has no author`).toBeGreaterThan(
    0,
  );
  expect(entry.sourceUrl, `${entry.file} has no license URL`).toMatch(
    /^https:\/\//u,
  );
  expect(entry.assetUrl, `${entry.file} has no asset URL`).toMatch(
    /^https:\/\//u,
  );
}

describe("audio assets", () => {
  it("ships a non-trivial mp3 under the sound effect size cap for every cue credit", () => {
    for (const credit of AUDIO_CREDITS) {
      const file = path.join(audioDir, credit.file);
      expect(fs.existsSync(file), `${credit.file} is missing`).toBe(true);
      const size = fs.statSync(file).size;
      expect(
        size,
        `${credit.file} is too small to be a sample`,
      ).toBeGreaterThan(1024);
      expect(
        size,
        `${credit.file} is over the ${CUE_MAX_BYTES} byte cue cap`,
      ).toBeLessThan(CUE_MAX_BYTES);
      expect(looksLikeMp3(file), `${credit.file} is not a real mp3`).toBe(
        true,
      );
    }
  });

  it("ships a non-trivial mp3 under the music size cap for every music credit", () => {
    for (const credit of MUSIC_CREDITS) {
      const file = path.join(audioDir, credit.file);
      expect(fs.existsSync(file), `${credit.file} is missing`).toBe(true);
      const size = fs.statSync(file).size;
      expect(
        size,
        `${credit.file} is too small to be a music bed`,
      ).toBeGreaterThan(1024);
      expect(
        size,
        `${credit.file} is over the ${MUSIC_MAX_BYTES} byte music cap`,
      ).toBeLessThan(MUSIC_MAX_BYTES);
      expect(looksLikeMp3(file), `${credit.file} is not a real mp3`).toBe(
        true,
      );
    }
  });

  it("gives every cue credit a CC0 or CC-BY license with a source URL", () => {
    for (const credit of AUDIO_CREDITS) {
      expectLicensed(credit);
      expect(credit.file.length).toBeGreaterThan(0);
    }
  });

  it("gives every music credit a CC0 or CC-BY license with a source URL", () => {
    for (const credit of MUSIC_CREDITS) {
      expectLicensed(credit);
      expect(credit.file.length).toBeGreaterThan(0);
    }
  });

  it("credits every mp3 in the folder exactly once, with no orphans", () => {
    const files = fs
      .readdirSync(audioDir)
      .filter((name: string) => name.endsWith(".mp3"))
      .toSorted();
    const credited = [
      ...AUDIO_CREDITS.map((credit) => credit.file),
      ...MUSIC_CREDITS.map((credit) => credit.file),
    ].toSorted();
    expect(files).toEqual(credited);
    expect(new Set(credited).size).toBe(credited.length);
  });

  it("names a real cue once per file", () => {
    const cues = AUDIO_CREDITS.map((credit) => credit.cue);
    const files = AUDIO_CREDITS.map((credit) => credit.file);
    expect(new Set(cues).size).toBe(AUDIO_CREDITS.length);
    expect(new Set(files).size).toBe(AUDIO_CREDITS.length);
    for (const cue of cues) {
      expect(CUE_IDS).toContain(cue);
    }
  });

  it("names a real music id once per file", () => {
    const musicIds = MUSIC_CREDITS.map((credit) => credit.music);
    const files = MUSIC_CREDITS.map((credit) => credit.file);
    expect(new Set(musicIds).size).toBe(MUSIC_CREDITS.length);
    expect(new Set(files).size).toBe(MUSIC_CREDITS.length);
    for (const music of musicIds) {
      expect(MUSIC_IDS).toContain(music);
    }
  });
});
