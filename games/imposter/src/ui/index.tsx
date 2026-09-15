// Imposter game UI: TV Host and Phone screens.
import type { GameUi } from "@opg/ui";
import type {
  ImposterAction,
  ImposterHostView,
  ImposterPlayerView,
} from "../state";
import { Host } from "./Host";
import { Phone } from "./Phone";

export const imposterUi: GameUi<
  ImposterHostView,
  ImposterPlayerView,
  ImposterAction
> = { Host, Phone };
