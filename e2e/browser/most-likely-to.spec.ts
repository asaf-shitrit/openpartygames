// Full Most Likely To game: one TV page plus three phone pages, all real UI.
import { expect, test } from "@playwright/test";
import {
  expectTvLobby,
  findVip,
  joinPhones,
  startGame,
  startRoom,
} from "./harness";
import { playOneRound } from "./most-likely-to";

test("three phones play a round of Most Likely To on the TV", async ({
  page,
  browser,
}) => {
  const code = await startRoom(page);
  await expectTvLobby(page, code);

  const phones = await joinPhones(browser, page, code, ["Ava", "Ben", "Cleo"]);
  const vip = await findVip(phones);
  await startGame(vip.page, "Most Likely To");

  await expect(page.getByText("Prompt 1 of 20")).toBeVisible();
  await playOneRound(page, phones);
  await expect(page.getByText("Prompt 2 of 20")).toBeVisible({
    timeout: 45_000,
  });

  await Promise.all(phones.map((phone) => phone.context.close()));
});
