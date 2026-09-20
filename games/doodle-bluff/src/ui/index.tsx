// Doodle Bluff game UI: TV Host and Phone screens.
import type { GameUi } from "@opg/ui";
import type { DoodleAction, DoodleHostView, DoodlePlayerView } from "../state";
import { doodleBluffAwardCopy } from "./award-copy";
import { Host } from "./Host";
import { Phone } from "./Phone";

export const doodleBluffUi: GameUi<DoodleHostView, DoodlePlayerView, DoodleAction> = {
  Host,
  Phone,
  awardCopy: doodleBluffAwardCopy,
};
