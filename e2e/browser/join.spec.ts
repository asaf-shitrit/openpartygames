// Lobby smoke: the real TV page creates a room and real phone pages join it.
import { expect, test } from "@playwright/test";
import { expectTvLobby, findVip, joinPhones, newPhonePage, startRoom } from "./harness";

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

test("a phone that types the room code joins on one tap of Join", async ({
  page,
  browser,
}) => {
  const code = await startRoom(page);
  await expectTvLobby(page, code);

  // The join form on "/" is what someone reaches without scanning the QR code. Every other
  // spec opens /<CODE> directly, which never exercises the hop from that form to the room.
  const { context, page: phone } = await newPhonePage(browser);
  await phone.goto("/join");
  await phone.getByLabel("Room code").fill(code);
  await phone.getByLabel("Your name").fill("Zed");
  await phone.getByRole("button", { name: "Join" }).click();

  await expect(phone.getByRole("button", { name: "That's me" })).toBeVisible();
  await expect(page.getByText("Zed", { exact: true }).first()).toBeVisible();

  await context.close();
});
