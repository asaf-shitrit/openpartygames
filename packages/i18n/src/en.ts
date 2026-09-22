// English strings: the source of truth. `Dictionary` (in dictionary.ts) is `typeof en`,
// so every other locale must supply exactly this shape — a missing or misspelled key
// is a compile error, same trick as the content-kind `satisfies Record<...>` maps.
//
// One file per namespace, under `en/`: five games' worth of copy in a single object was
// a file nobody could edit without colliding with someone else editing a different screen.
import { common } from "./en/common";
import { join } from "./en/join";
import { avatarPicker } from "./en/avatarPicker";
import { lobby } from "./en/lobby";
import { mostLikelyTo } from "./en/mostLikelyTo";
import { imposter } from "./en/imposter";
import { realOrNah } from "./en/realOrNah";
import { doodleBluff } from "./en/doodleBluff";
import { results } from "./en/results";
import { picker } from "./en/picker";
import { landing } from "./en/landing";
import { status } from "./en/status";
import { kit } from "./en/kit";

export const en = {
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
