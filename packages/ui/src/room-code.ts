// The room code a no-TV room shows on every phone screen: its rejoin path. PhoneScreen provides
// it and PhoneStrip reads it, so a game passes the code once instead of to every strip.
import { createContext, useContext } from "react";
import type { PlayerRoomView } from "@opg/protocol";

export const RoomCodeContext = createContext<string | undefined>(undefined);

/** The code a phone should show in its strip: the room's in a no-TV room, none on a shared screen. */
export function phoneRoomCode(room: Pick<PlayerRoomView, "code" | "sharedScreen">): string | undefined {
  return room.sharedScreen ? undefined : room.code;
}

export function useRoomCode(): string | undefined {
  return useContext(RoomCodeContext);
}
