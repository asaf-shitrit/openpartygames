// The phone half of the TV's StartingScreen (HostApp.tsx) — the beat between "start" and the
// first round, which every phone used to spend reading "a game is already running".
import type { PlayerRoomView } from "@opg/protocol";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { Avatar, Highlight, Marker, PhoneScreen, StickyNote } from "@opg/ui";

function startingGameName(view: PlayerRoomView, t: Dictionary): string {
  return (
    view.games.find((g) => g.id === view.selectedGameId)?.name ??
    t.status.startingGameFallback
  );
}

function myAvatar(view: PlayerRoomView) {
  return view.players.find((p) => p.id === view.you)?.avatar ?? null;
}

/**
 * Shown to everyone the room is about to deal into the game. It says the same two lines the TV
 * says, because the phones and the TV are one room: in a no-TV room this is the only place the
 * words appear at all, and in a room with a TV a phone that disagreed with the screen in front
 * of it would be worse than a phone that said nothing.
 */
export function PhoneStarting({ view }: { view: PlayerRoomView }) {
  const { t } = useLocale();
  return (
    <PhoneScreen fit>
      <div
        style={{
          flex: "1 1 0",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          textAlign: "center",
        }}
      >
        <Avatar id={myAvatar(view)} size={120} />
        <Highlight style={{ padding: "0 10px", maxWidth: "100%" }}>
          <Marker
            level={1}
            size={38}
            style={{
              lineHeight: 1.15,
              maxWidth: "100%",
              overflowWrap: "anywhere",
            }}
          >
            {format(t.status.startingHeading, {
              game: startingGameName(view, t),
            })}
          </Marker>
        </Highlight>
        <StickyNote
          tilt={-1}
          style={{ padding: "14px 16px", maxWidth: "100%" }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.35 }}>
            {t.status.startingBody}
          </div>
        </StickyNote>
      </div>
    </PhoneScreen>
  );
}
