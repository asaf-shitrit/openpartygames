// Play-through driving for one full Imposter game through the real phone UI.
//
// The test harness reads each phone's own word screen to learn who the imposter
// is, so the crew can vote them out on purpose. That forces the caught path:
// reveal, last chance, and a (wrong) guess, every word.

import { expect, type Page } from "@playwright/test";
import { assertLayout } from "./layout-check";
import { repeat, type Phone } from "./harness";

const WORDS_PER_GAME = 6;
const WRONG_GUESS = "definitely-not-the-word";
const CLUE_TIMEOUT_MS = 150_000;

/** Plays all six words, stopping right after the last result screen. */
export async function playImposter(tv: Page, phones: Phone[]): Promise<void> {
      await repeat(WORDS_PER_GAME, () => playWord(tv, phones));
}

async function playWord(tv: Page, phones: Phone[]): Promise<void> {
      await expect(tv.getByText("Check your phones!")).toBeVisible();
      await assertLayout(tv, "tv", "imposter word-check phase (tv)");
      const imposter = await findImposter(phones);
      await takeClues(phones);
      await voteOut(tv, phones, imposter);
      await expect(tv.getByText(/One last chance/)).toBeVisible();
      await assertLayout(tv, "tv", "imposter last-chance phase (tv)");
      await sendWrongGuess(imposter);
      // The stamp slams in first; "The word was" follows about 1s later.
      await expect(tv.getByText(/nope/i).first()).toBeVisible();
      await expect(tv.getByText("The word was")).toBeVisible();
      await assertLayout(tv, "tv", "imposter result phase (tv)");
}

/** Every word card starts face down: hold to peek before its role text is readable. */
async function peekCard(phone: Phone): Promise<void> {
      await phone.page
            .getByRole("button", { name: "Your secret card" })
            .click({ timeout: 20_000 });
}

/** The one phone whose word screen says it got the decoy. */
async function findImposter(phones: Phone[]): Promise<Phone> {
      const claims = await Promise.all(
            phones.map(async (phone) => {
                  await peekCard(phone);
                  await phone.page
                        .getByText(/you're the imposter|here's your word/i)
                        .first()
                        .waitFor({ state: "visible", timeout: 20_000 });
                  await assertLayout(phone.page, "phone", `imposter word revealed (${phone.name})`);
                  return {
                        phone,
                        isImposter: await phone.page
                              .getByText(/you're the imposter/i)
                              .isVisible(),
                  };
            }),
      );
      const imposter = claims.find((claim) => claim.isImposter)?.phone;
      if (!imposter) throw new Error("no phone showed the imposter word");
      return imposter;
}

/** Waits for a phone's own clue turn, checks that turn's layout, then taps "I'm done". */
async function takeClue(phone: Phone): Promise<void> {
      const doneButton = phone.page.getByRole("button", { name: /I'm done/i });
      await doneButton.waitFor({ state: "visible", timeout: CLUE_TIMEOUT_MS });
      await assertLayout(phone.page, "phone", `imposter clue turn (${phone.name})`);
      await doneButton.click();
}

/** Every phone taps "I'm done" when its own clue turn comes around. */
async function takeClues(phones: Phone[]): Promise<void> {
      await Promise.all(phones.map((phone) => takeClue(phone)));
}

async function voteOut(
      tv: Page,
      phones: Phone[],
      imposter: Phone,
): Promise<void> {
      await expect(tv.getByText("Vote on your phones!")).toBeVisible();
      await assertLayout(tv, "tv", "imposter vote phase (tv)");
      await Promise.all(phones.map((phone) => castVote(phone, imposter)));
      await expect(tv.getByText("The votes are in")).toBeVisible();
}

/** Crew votes for the imposter; the imposter votes for anyone but itself. */
async function castVote(phone: Phone, imposter: Phone): Promise<void> {
      const rows = phone.page.locator("button.opg-reset");
      const target =
            phone === imposter
                  ? rows.first()
                  : rows.filter({ hasText: imposter.name });
      await expect(phone.page.getByRole("button", { name: /Lock in vote/ })).toBeVisible();
      await assertLayout(phone.page, "phone", `imposter vote phase (${phone.name})`);
      await target.click();
      await phone.page.getByRole("button", { name: /Lock in vote/ }).click();
}

async function sendWrongGuess(imposter: Phone): Promise<void> {
      await expect(imposter.page.getByLabel("Your guess")).toBeVisible();
      await assertLayout(imposter.page, "phone", `imposter last-chance guess (${imposter.name})`);
      await imposter.page.getByLabel("Your guess").fill(WRONG_GUESS);
      await imposter.page.getByRole("button", { name: /Submit guess/ }).click();
}
