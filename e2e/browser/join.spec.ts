// Lobby smoke: the real TV page creates a room and real phone pages join it.
import { expect, test } from "@playwright/test";
import { expectTvLobby, findVip, joinPhones, startRoom } from "./harness";

test("TV creates a room, phones join and the VIP gets the controls", async ({
  page,
  browser,
}) => {
  const code = await startRoom(page);
  await expectTvLobby(page, code);

  const phones = await joinPhones(browser, page, code, ["Ava", "Ben", "Cleo"]);
  const vip = await findVip(phones);

  await expect(page.getByText("is the VIP and picks the game")).toBeVisible();

  const nonVip = phones.find((phone) => phone !== vip);
  if (!nonVip) throw new Error("expected at least one non-VIP phone");
  await expect(
    nonVip.page.getByText("is the VIP and picks the game"),
  ).toBeVisible();
  await expect(
    nonVip.page.getByRole("button", { name: /^Start / }),
  ).toHaveCount(0);

  await Promise.all(phones.map((phone) => phone.context.close()));
});
