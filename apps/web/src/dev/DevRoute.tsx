// Dev-only pages: the sound board and the moment player. Reached only via the dev routes.
import { Stage } from "@opg/ui";
import { MomentPlayer } from "./MomentPlayer";
import { SoundBoard } from "./SoundBoard";

export type DevMode = "sounds" | "moments";

export default function DevRoute({ mode }: { mode: DevMode }) {
  return <Stage>{mode === "sounds" ? <SoundBoard /> : <MomentPlayer />}</Stage>;
}
