import type { Dictionary } from "../dictionary";

export const realOrNah: Dictionary["realOrNah"] = {
  awards: {
    bestLiar: "השקרן/ית הכי טוב/ה",
    bestLiarDetail: "רימה/תה {people}",
    truthFinder: "מגלה/ת האמת",
    truthFinderDetail: "מצא/ה {answers}",
    greatestHit: "הלהיט הגדול",
    greatestHitDetail: "שקר אחד רימה {people}",
    mostTrusting: "התמים/ה ביותר",
    mostTrustingDetail: "האמין/ה ל{lies}",
    people: { one: "אדם אחד", other: "{count} אנשים" },
    answers: { one: "תשובה אמיתית אחת", other: "{count} תשובות אמיתיות" },
    lies: { one: "שקר אחד", other: "{count} שקרים" },
  },
};
