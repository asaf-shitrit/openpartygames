import type { Dictionary } from "../dictionary";

export const common: Dictionary["common"] = {
  languageLabel: "שפה",
  someone: "מישהו",
  errorRoomFull: "החדר מלא.",
  errorRoomLocked: "החדר נעול.",
  errorNameTaken: "השם הזה תפוס. נסו שם אחר.",
  errorNameInvalid: "שם חייב להכיל 1–12 תווים.",
  errorNotEnoughPlayers: "עדיין אין מספיק שחקנים.",
  errorInvalidAction: "זה לא עבד. בדקו את המשחק והחפיסות.",
  errorGeneric: "משהו השתבש. נסו שוב.",
  listAndTwo: "{a} ו{b}",
  listAndLast: "{list} ו{last}",
  listOrTwo: "{a} או {b}",
  listOrLast: "{list} או {last}",
  place: {
    first: "במקום הראשון",
    second: "במקום השני",
    third: "במקום השלישי",
    fourth: "במקום הרביעי",
    fifth: "במקום החמישי",
    sixth: "במקום השישי",
    seventh: "במקום השביעי",
    eighth: "במקום השמיני",
    other: "במקום ה-{rank}",
  },
};
