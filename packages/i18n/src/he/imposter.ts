import type { Dictionary } from "../dictionary";

export const imposter: Dictionary["imposter"] = {
  awards: {
    wordThief: "גנב/ת מילים",
    wordThiefDetail: "גנב/ה את המילה {times}",
    masterOfDisguise: "אמן/ית ההסוואה",
    masterOfDisguiseDetail: "חמק/ה {times}",
    sharpestEye: "העין החדה",
    sharpestEyeDetail: "זיהה/תה את המתחזה {times}",
    trustedCrew: "צוות אמין",
    trustedCrewDetail: "אף אחד לא חשד בהם ב{words}",
    times: { one: "פעם אחת", other: "{count} פעמים" },
    words: { one: "מילה אחת", other: "{count} מילים" },
  },
};
