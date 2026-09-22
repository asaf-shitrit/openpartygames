import type { Dictionary } from "../dictionary";

export const kit: Dictionary["kit"] = {
  timer: {
    // Describes the state itself (open-ended time), not an absence ("no timer").
    noTimer: "זמן פתוח",
    left: "נותרו {time}",
    leftAlmostOut: "נותרו {time}, כמעט נגמר",
  },
  sound: {
    on: "קול פועל",
    off: "קול כבוי",
    tapForSound: "הקישו להפעלת קול",
  },
  fullScreen: "מסך מלא",
  room: "חדר",
  roomCode: "חדר {code}",
  eyesOnTv: {
    screen: "תסתכלו על הטלוויזיה",
    room: "תסתכלו על החדר",
  },
  playerAvatarAlt: "האווטאר של {name}",
  doodle: {
    undo: "בטלו",
    clear: "נקו",
    confirmClear: "למחוק את הציור? הקישו שוב לאישור",
    tapAgainToClear: "הקישו שוב למחיקה",
    ariaLabel: "הציור שלכם עבור {prompt}: {strokes} עד כה",
    strokes: { one: "קו אחד", two: "שני קווים", other: "{count} קווים" },
    penColorGroup: "צבע העט",
    pen: "עט {name}",
    penSelected: "עט {name}, נבחר",
    inkFallback: "דיו {n}",
  },
  ink: {
    ink: "דיו",
    red: "אדום",
    blue: "כחול",
    green: "ירוק",
    orange: "כתום",
    purple: "סגול",
  },
};
