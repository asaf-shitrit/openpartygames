// Reconnect mid-game: a phone reloads during the write phase and rejoins by
// token, then the same fact keeps going through the real UI.
import { expect, test } from "@playwright/test";
import {
  expectTvLobby,
  findVip,
  joinPhones,
  startGame,
  startRoom,
} from "./harness";
import { playOneFact } from "./real-or-nah";

test("a phone reloads mid-game and rejoins with its seat", async ({
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

  const reloaded = phones[1];
  if (!reloaded) throw new Error("missing second phone");
  await reloaded.page.reload();
  await expect(reloaded.page.getByLabel("Your lie")).toBeVisible({
    timeout: 30_000,
  });

  await playOneFact(page, phones);
  await expect(page.getByText("The truth")).toBeVisible();
  await expect(page.getByText("Cleo", { exact: true }).first()).toBeVisible();

  await Promise.all(phones.map((phone) => phone.context.close()));
});
