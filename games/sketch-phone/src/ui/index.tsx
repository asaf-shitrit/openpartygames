// Sketch Phone game UI: TV Host and Phone screens, plus the finale's award copy.
import type { GameUi } from "@opg/ui";
import type { SketchAction, SketchHostView, SketchPlayerView } from "../state";
import { sketchPhoneAwardCopy } from "./award-copy";
import { Host } from "./Host";
import { Phone } from "./Phone";

export const sketchPhoneUi: GameUi<SketchHostView, SketchPlayerView, SketchAction> = {
  Host,
  Phone,
  awardCopy: sketchPhoneAwardCopy,
};
