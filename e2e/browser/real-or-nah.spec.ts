// Full Real or Nah game: one TV page plus three phone pages, all real UI.
import { test } from "@playwright/test";
import {
  expectFinalScores,
  expectTvLobby,
  findVip,
  joinPhones,
  startGame,
  startRoom,
} from "./harness";
import { playRealOrNah } from "./real-or-nah";

test("three phones play a full Real or Nah game on the TV", async ({
  page,
  browser,
}) => {
  const code = await startRoom(page);
  await expectTvLobby(page, code);

  const phones = await joinPhones(browser, page, code, ["Ava", "Ben", "Cleo"]);
  const vip = await findVip(phones);
  await startGame(vip.page, "Real or Nah");

  await playRealOrNah(page, phones);
  await expectFinalScores(page);

  await Promise.all(phones.map((phone) => phone.context.close()));
});
