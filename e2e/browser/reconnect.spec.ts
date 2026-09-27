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
  // `playOneFact` already walks the reveal and ends on the standings, and the reveal now swaps
  // the duds/lies/truth stack out for them rather than stacking both — the TV stage does not
  // scroll, and the room has read the facts by the time the scores land. So the post-condition
  // here is the settled scoreboard, not the truth card that came before it.
  //
  // It also names the phone that actually reloaded. This asserted a third player's name, which
  // would have passed just as well if Ben's seat had been lost — the one thing the test exists
  // to prove.
  await expect(page.getByText("Standings")).toBeVisible();
  await expect(
    page.getByText(reloaded.name, { exact: true }).first(),
  ).toBeVisible();

  await Promise.all(phones.map((phone) => phone.context.close()));
});
