// Copy owned by the Doodle Notebook UI kit (packages/ui): the same wherever the kit is used,
// so it lives here instead of being threaded through every caller as a prop.
export const kit = {
  timer: {
    noTimer: "No timer",
    left: "Time left {time}",
    leftAlmostOut: "Time left {time}, almost out",
  },
  sound: {
    on: "Sound on",
    off: "Sound off",
    tapForSound: "Tap for sound",
  },
  fullScreen: "Full screen",
  room: "Room",
  roomCode: "Room {code}",
  eyesOnTv: {
    screen: "Eyes on the TV",
    room: "Eyes on the room",
  },
  playerAvatarAlt: "{name}'s avatar",
  /**
   * Tally renders "×N" for sighted players; this is the same count read aloud. `two` is here
   * for Hebrew's dual, which needs its own form — English just repeats `other`, the same way
   * `doodle.strokes` below does.
   */
  crowns: { one: "1 crown", two: "{count} crowns", other: "{count} crowns" },
  doodle: {
    undo: "Undo",
    clear: "Clear",
    confirmClear: "Clear the drawing? Tap again to confirm",
    tapAgainToClear: "Tap again to clear",
    ariaLabel: "Your drawing for {prompt}: {strokes} so far",
    strokes: { one: "1 stroke", two: "{count} strokes", other: "{count} strokes" },
    penColorGroup: "Pen colour",
    pen: "{name} pen",
    penSelected: "{name} pen, selected",
    inkFallback: "Ink {n}",
    keyboardInstructions:
      "Use the arrow keys to move the pen. Press space or enter to put it down or lift it. Press escape to cancel a line you have not finished.",
    keyboardDrawing: "Drawing a line. Press space or enter to lift the pen.",
  },
  ink: {
    ink: "Ink",
    red: "Red",
    blue: "Blue",
    green: "Green",
    orange: "Orange",
    purple: "Purple",
  },
};
