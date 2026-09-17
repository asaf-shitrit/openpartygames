// Most Likely To game UI: TV Host and Phone screens.
import type { GameUi } from "@opg/ui";
import type { MltAction, MltHostView, MltPlayerView } from "../state";
import { Host } from "./Host";
import { Phone } from "./Phone";
import { mostLikelyToAwardCopy } from "./award-copy";

export const mostLikelyToUi: GameUi<MltHostView, MltPlayerView, MltAction> = {
  Host,
  Phone,
  awardCopy: mostLikelyToAwardCopy,
};
