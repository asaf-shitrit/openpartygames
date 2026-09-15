// Real or Nah game UI: host stage + phone controller.
import type { GameUi } from "@opg/ui";
import type { RonAction, RonHostView, RonPlayerView } from "../types";
import { Host } from "./Host";
import { Phone } from "./Phone";

export const realOrNahUi: GameUi<RonHostView, RonPlayerView, RonAction> = {
  Host,
  Phone,
};

export { realOrNahPreviews } from "./preview";
export type { RonAction, RonHostView, RonPlayerView } from "../types";
