import type { Dictionary } from "../dictionary";

export const kit: Dictionary["kit"] = {
  timer: {
    // Describes the state itself (open-ended time), not an absence ("no timer").
    noTimer: "זמן פתוח",
    left: "נותרו {time}",
    leftAlmostOut: "נותרו {time}, כמעט נגמר",
    finalStageAnnounce: "כמעט נגמר הזמן",
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
  crowns: { one: "כתר אחד", two: "שני כתרים", other: "{count} כתרים" },
  doodle: {
    full: "הדף מלא. בטלו קו כדי להמשיך לצייר.",
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
    keyboardInstructions:
      "השתמשו בחצים כדי להזיז את העט. הקישו על רווח או Enter כדי להוריד או להרים אותו. הקישו Escape כדי לבטל קו שטרם הושלם.",
    keyboardDrawing: "מציירים קו. הקישו על רווח או Enter כדי להרים את העט.",
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
