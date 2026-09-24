// Dev-only pages: the sound board, the moment player and the screen gallery. Reached only
// via the dev routes.
import { Stage } from "@opg/ui";
import { MomentPlayer } from "./MomentPlayer";
import { ScreenGallery } from "./ScreenGallery";
import { SoundBoard } from "./SoundBoard";

export type DevMode = "sounds" | "moments" | "screens";

export default function DevRoute({ mode }: { mode: DevMode }) {
  // The gallery renders a screen at its own real size, so it gets no TV stage around it.
  if (mode === "screens") return <ScreenGallery />;
  return <Stage>{mode === "sounds" ? <SoundBoard /> : <MomentPlayer />}</Stage>;
}
