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
  await expect(vip.page.getByText("You're the VIP")).toBeVisible();

  await Promise.all(phones.map((phone) => phone.context.close()));
});
