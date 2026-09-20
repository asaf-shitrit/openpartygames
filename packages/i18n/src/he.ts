// Hebrew strings. Typed as `Dictionary` (see dictionary.ts) so a key missing here, or
// misspelled, is a TypeScript error rather than an English string leaking into the
// Hebrew build. Uses the gender-neutral plural "אתם" for "you", the common convention
// in Hebrew software UI, rather than tracking each player's grammatical gender.
//
// One file per namespace, under `he/`, mirroring `en/`.
import type { Dictionary } from "./dictionary";
import { common } from "./he/common";
import { join } from "./he/join";
import { avatarPicker } from "./he/avatarPicker";
import { lobby } from "./he/lobby";
import { mostLikelyTo } from "./he/mostLikelyTo";
import { imposter } from "./he/imposter";
import { realOrNah } from "./he/realOrNah";
import { doodleBluff } from "./he/doodleBluff";
import { results } from "./he/results";
import { picker } from "./he/picker";
import { landing } from "./he/landing";
import { status } from "./he/status";
import { kit } from "./he/kit";

export const he: Dictionary = {
  common,
  join,
  avatarPicker,
  lobby,
  mostLikelyTo,
  imposter,
  realOrNah,
  doodleBluff,
  results,
  picker,
  landing,
  status,
  kit,
};
