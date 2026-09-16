// Credits for the sampled TV cues and music beds in apps/web/public/audio/. Every file there
// must have an entry in exactly one of AUDIO_CREDITS or MUSIC_CREDITS, and every entry must be
// CC0-1.0, CC-BY-3.0 or CC-BY-4.0 (see the intent doc's audio rule). The audio manifest and the
// in-app credits screen both read these lists.
import type { CueId, MusicId } from "./types";

export type AudioLicense = "CC0-1.0" | "CC-BY-3.0" | "CC-BY-4.0";

export interface AudioCredit {
  /** Cue this sample replaces once the engine has decoded it. */
  cue: CueId;
  /** File name under apps/web/public/audio/. */
  file: string;
  /** Short title shown on the credits screen. */
  title: string;
  /** Author named on the credits screen. */
  author: string;
  /** SPDX license id. CC-BY entries must carry exact attribution. */
  license: AudioLicense;
  /** The license page that was checked before shipping the file. */
  sourceUrl: string;
  /** Where the sample itself was published. */
  assetUrl: string;
}

export const AUDIO_CREDITS: AudioCredit[] = [
  {
    cue: "whoosh",
    file: "whoosh.mp3",
    title: "Whoosh #3",
    author: "Joseph SARDIN (BigSoundBank)",
    license: "CC0-1.0",
    sourceUrl: "https://bigsoundbank.com/licenses.html",
    assetUrl: "https://bigsoundbank.com/whoosh-3-s1795.html",
  },
  {
    cue: "scratch",
    file: "scratch.mp3",
    title: "Scratch 001",
    author: "Kenney (kenney.nl)",
    license: "CC0-1.0",
    sourceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    assetUrl: "https://kenney.nl/assets/interface-sounds",
  },
  {
    cue: "slam",
    file: "slam.mp3",
    title: "Impact soft heavy 000",
    author: "Kenney (kenney.nl)",
    license: "CC0-1.0",
    sourceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    assetUrl: "https://kenney.nl/assets/impact-sounds",
  },
  {
    cue: "buzzer",
    file: "buzzer.mp3",
    title: "Error 006",
    author: "Kenney (kenney.nl)",
    license: "CC0-1.0",
    sourceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    assetUrl: "https://kenney.nl/assets/interface-sounds",
  },
  {
    cue: "boing",
    file: "boing.mp3",
    title: "Boing cartoon #3",
    author: "Joseph SARDIN (BigSoundBank)",
    license: "CC0-1.0",
    sourceUrl: "https://bigsoundbank.com/licenses.html",
    assetUrl: "https://bigsoundbank.com/boing-cartoon-3-s2279.html",
  },
  {
    cue: "marker",
    file: "marker.mp3",
    title: "Whiteboard marker",
    author: "Joseph SARDIN (BigSoundBank)",
    license: "CC0-1.0",
    sourceUrl: "https://bigsoundbank.com/licenses.html",
    assetUrl: "https://bigsoundbank.com/whiteboard-marker-s0807.html",
  },
  {
    cue: "sneak",
    file: "sneak.mp3",
    title: "Footstep carpet 002",
    author: "Kenney (kenney.nl)",
    license: "CC0-1.0",
    sourceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    assetUrl: "https://kenney.nl/assets/impact-sounds",
  },
  {
    cue: "tape",
    file: "tape.mp3",
    title: "Adhesive tape #1",
    author: "Joseph SARDIN (BigSoundBank)",
    license: "CC0-1.0",
    sourceUrl: "https://bigsoundbank.com/licenses.html",
    assetUrl: "https://bigsoundbank.com/adhesive-tape-1-s0297.html",
  },
  {
    cue: "pop",
    file: "pop.mp3",
    title: "Champagne cork",
    author: "Joseph SARDIN (BigSoundBank)",
    license: "CC0-1.0",
    sourceUrl: "https://bigsoundbank.com/licenses.html",
    assetUrl: "https://bigsoundbank.com/champagne-cork-s0211.html",
  },
  {
    cue: "jingle-start",
    file: "jingle-start.mp3",
    title: "Steel jingle 07",
    author: "Kenney (kenney.nl)",
    license: "CC0-1.0",
    sourceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    assetUrl: "https://kenney.nl/assets/music-jingles",
  },
  {
    cue: "fanfare",
    file: "fanfare.mp3",
    title: "8-Bit jingle 00",
    author: "Kenney (kenney.nl)",
    license: "CC0-1.0",
    sourceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    assetUrl: "https://kenney.nl/assets/music-jingles",
  },
];

export interface MusicCredit {
  /** Music bed this file provides. */
  music: MusicId;
  /** File name under apps/web/public/audio/. */
  file: string;
  /** Short title shown on the credits screen. */
  title: string;
  /** Author named on the credits screen. */
  author: string;
  /** SPDX license id. CC-BY entries must carry exact attribution. */
  license: AudioLicense;
  /** The license page that was checked before shipping the file. */
  sourceUrl: string;
  /** Where the sample itself was published. */
  assetUrl: string;
  /** Loop region, in seconds, the engine hands to the buffer source. */
  loopStartSec: number;
  loopEndSec: number;
}

export const MUSIC_CREDITS: MusicCredit[] = [
  {
    music: "lobby",
    file: "lobby.mp3",
    title: "Swinging Sweet (looped)",
    author: "Hernanda Cahyo Kurniawan (hernandack)",
    license: "CC0-1.0",
    sourceUrl: "https://opengameart.org/content/short-loops-background-music-pack",
    assetUrl: "https://opengameart.org/content/short-loops-background-music-pack",
    loopStartSec: 0,
    loopEndSec: 44.91,
  },
  {
    music: "tension",
    file: "tension.mp3",
    title: "Tension",
    author: "tapatilorenzo",
    license: "CC0-1.0",
    sourceUrl: "https://opengameart.org/content/midi-2-tension-songs",
    assetUrl: "https://opengameart.org/content/midi-2-tension-songs",
    loopStartSec: 0,
    loopEndSec: 40,
  },
];
