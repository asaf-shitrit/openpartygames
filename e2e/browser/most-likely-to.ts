// Play-through driving for Most Likely To through the real phone UI.
// Each round: everyone picks a row and locks in, the TV reveals a verdict,
// and each phone lands its own personal result card.

import { expect, type Page } from "@playwright/test";
import { assertLayout } from "./layout-check";
import type { Phone } from "./harness";

/**
 * Plays one full round: everyone votes for the first player, so the TV must
 * stamp a clear pick, then every phone lands its personal card.
 */
export async function playOneRound(tv: Page, phones: Phone[]): Promise<void> {
  await expect(tv.getByText("Vote for anyone, even yourself")).toBeVisible({
    timeout: 45_000,
  });
  await assertLayout(tv, "tv", "most-likely-to vote phase (tv)");
  await assertPhones(phones, "most-likely-to vote phase");
  await lockVotes(phones);
  await expect(tv.getByText("Most likely!").first()).toBeVisible({
    timeout: 45_000,
  });
  await assertLayout(tv, "tv", "most-likely-to reveal phase (tv)");
  await expectPersonalCards(phones);
  await assertPhones(phones, "most-likely-to reveal phase");
}

/** Every phone's current screen holds to the layout and painted checks. */
async function assertPhones(phones: Phone[], label: string): Promise<void> {
  await Promise.all(
    phones.map((phone) => assertLayout(phone.page, "phone", `${label} (${phone.name})`)),
  );
}

async function lockVotes(phones: Phone[]): Promise<void> {
  await Promise.all(phones.map((phone) => lockVote(phone)));
}

/** Picks the top row (the first player to join) and locks in. */
async function lockVote(phone: Phone): Promise<void> {
  await phone.page.locator("button.opg-reset").first().click();
  await phone.page.getByRole("button", { name: /Lock in vote/ }).click();
}

async function expectPersonalCards(phones: Phone[]): Promise<void> {
  await Promise.all(
    phones.map((phone) =>
      expect(
        phone.page.getByTestId("reveal-content"),
      ).toBeVisible({ timeout: 45_000 }),
    ),
  );
}
