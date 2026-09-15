// The sample lookup. `credits.ts` is the data (one credit per shipped MP3); this module resolves
// a cue or music id to its file so the loader and the engine do not care where the list lives.
import {
  AUDIO_CREDITS,
  MUSIC_CREDITS,
  type AudioCredit,
  type MusicCredit,
} from "./credits";
import type { CueId, MusicId } from "./types";

/** The credit whose sample replaces this cue's synth, or null when the cue is synth-only. */
export function sampleFor(cue: CueId): AudioCredit | null {
  return AUDIO_CREDITS.find((credit) => credit.cue === cue) ?? null;
}

/** Public path of a sample under the web app root. */
export function sampleUrl(credit: AudioCredit): string {
  return `/audio/${credit.file}`;
}

/** The credit for this music bed's file. */
export function musicSampleFor(music: MusicId): MusicCredit | null {
  return MUSIC_CREDITS.find((credit) => credit.music === music) ?? null;
}

/** Public path of a music file under the web app root. */
export function musicSampleUrl(credit: MusicCredit): string {
  return `/audio/${credit.file}`;
}
