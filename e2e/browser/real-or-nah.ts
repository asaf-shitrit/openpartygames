// Play-through driving for one full Real or Nah game through the real phone UI.
// Each fact: write a lie, vote for someone else's answer, watch the reveal.

import { expect, type Page } from "@playwright/test";
import { repeat, type Phone } from "./harness";
import { assertLayout } from "./layout-check";

const FACTS_PER_GAME = 6;

/** Plays all six facts, stopping right after the last reveal. */
export async function playRealOrNah(tv: Page, phones: Phone[]): Promise<void> {
  await repeat(FACTS_PER_GAME, () => playOneFact(tv, phones));
}

/** One fact: write a lie, vote for someone else's answer, watch the reveal. */
export async function playOneFact(tv: Page, phones: Phone[]): Promise<void> {
  await expect(
    tv.getByText("Write a believable lie on your phone"),
  ).toBeVisible({ timeout: 45000 });
  await assertLayout(tv, "tv", "real-or-nah write phase (tv)");
  await assertPhones(phones, "real-or-nah write phase");
  await submitLies(phones);
  await expect(tv.getByText("Which one is real?")).toBeVisible();
  await assertLayout(tv, "tv", "real-or-nah vote phase (tv)");
  await lockVotes(phones);
  // The reveal now lasts up to 30s (intro, duds, one beat per fooler, the truth,
  // then standings), so give it more than the default timeout to land.
  await expect(tv.getByText("The truth")).toBeVisible({ timeout: 45000 });
  await assertLayout(tv, "tv", "real-or-nah reveal phase (tv)");
  await expect(tv.getByText("Standings")).toBeVisible({ timeout: 45000 });
}

/** Every phone's current screen holds to the layout and painted checks. */
async function assertPhones(phones: Phone[], label: string): Promise<void> {
  await Promise.all(
    phones.map((phone) => assertLayout(phone.page, "phone", `${label} (${phone.name})`)),
  );
}

async function submitLies(phones: Phone[]): Promise<void> {
  await Promise.all(phones.map((phone) => submitLie(phone)));
}

async function submitLie(phone: Phone): Promise<void> {
  await phone.page.getByLabel("Your lie").fill(`lie ${phone.name}`);
  await phone.page.getByRole("button", { name: /Submit lie/ }).click();
}

async function lockVotes(phones: Phone[]): Promise<void> {
  await Promise.all(phones.map((phone) => lockVote(phone)));
}

async function lockVote(phone: Phone): Promise<void> {
  await phone.page.locator("button[aria-pressed]").first().click();
  await phone.page.getByRole("button", { name: /Lock in/ }).click();
}
