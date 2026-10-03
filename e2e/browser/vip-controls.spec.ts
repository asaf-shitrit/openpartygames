// The VIP's in-game controls: skip the current phase, then end the game.
import { expect, test } from "@playwright/test";
import {
  expectTvLobby,
  findVip,
  joinPhones,
  startGame,
  startRoom,
} from "./harness";

test("the VIP skips a phase and ends the game for everyone", async ({
  page,
  browser,
}) => {
  const code = await startRoom(page);
  await expectTvLobby(page, code);

  const phones = await joinPhones(browser, page, code, ["Ava", "Ben", "Cleo"]);
  const vip = await findVip(phones);
  await startGame(vip.page, "Real or Nah");

  await expect(
    page.getByText("Write a believable lie on your phone"),
  ).toBeVisible();
  await vip.page.getByRole("button", { name: "Skip this part" }).click();
  await expect(page.getByText("Which one is real?")).toBeVisible();

  await vip.page.getByRole("button", { name: "End game" }).click();
  await vip.page.getByRole("button", { name: "Yes, end it" }).click();

  await expect(
    page.locator(".opg-marker").filter({ hasText: "Final scores" }),
  ).toBeVisible();

  // This asserted that the VIP was back on their controls the instant the game ended. That was
  // true because the finale and the controls rendered as siblings on one 200dvh column, so
  // "You're the VIP" was on the page — below the fold, under a page seam a phone cannot show.
  // The finale now owns the screen until the VIP taps out of it, which is the whole point: the
  // picker used to race ahead and land on top of the crown. So the way back is a tap, and this
  // walks it rather than asserting the state that tap exists to reach.
  await vip.page
    .getByRole("button", { name: "Pick the next game" })
    .click();
  await expect(vip.page.getByText("You're the VIP")).toBeVisible();

  await Promise.all(phones.map((phone) => phone.context.close()));
});

test("a removed player who reloads gets a clean join form, not a name error", async ({
  page,
  browser,
}) => {
  const code = await startRoom(page);
  await expectTvLobby(page, code);

  const phones = await joinPhones(browser, page, code, ["Ava", "Ben", "Cleo"]);
  const vip = await findVip(phones);
  const victim = phones.find((phone) => phone !== vip);
  if (!victim) throw new Error("expected a non-VIP phone");

  await vip.page.getByRole("button", { name: `Kick ${victim.name}` }).click();
  await vip.page.getByRole("button", { name: "Yes, remove" }).click();
  await expect(victim.page.getByText("You were removed")).toBeVisible();

  // The saved token no longer matches a seat, so the reload's socket joins with no name.
  await victim.page.reload();
  await expect(victim.page.getByLabel("Your name")).toBeVisible();
  await victim.page.waitForTimeout(1500);
  await expect(victim.page.getByText(/Names are 1/)).toHaveCount(0);

  await Promise.all(phones.map((phone) => phone.context.close()));
});
