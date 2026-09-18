// No-TV mode: three phone contexts and no TV page at all. Phone tabs sharing one origin
// share localStorage player tokens, so every phone here gets its own browser context.
import { expect, test } from "@playwright/test";
import {
  findVip,
  joinPhone,
  startGame,
  startRoomFromPhone,
  type Phone,
} from "./harness";
import {
  expectNextRoundReady,
  expectSettledAfterReload,
  playOneRoundNoTv,
} from "./no-tv";

async function closePhones(phones: Phone[]): Promise<void> {
  await Promise.all(phones.map((phone) => phone.context.close()));
}

test("a phone starts a room and two more join by typing the code", async ({
  browser,
}) => {
  const { code, starter } = await startRoomFromPhone(browser, "Ava");
  await expect(starter.page.getByText(`Room ${code}`)).toBeVisible();

  const [ben, cleo] = await Promise.all([
    joinPhone(browser, code, "Ben"),
    joinPhone(browser, code, "Cleo"),
  ]);
  await expect(ben.page.getByText("You're in!")).toBeVisible();
  await expect(cleo.page.getByText("You're in!")).toBeVisible();
  await expect(starter.page.getByText("You're the VIP")).toBeVisible();

  await closePhones([starter, ben, cleo]);
});

test("three phones play a full round of Most Likely To with no TV page open", async ({
  browser,
}) => {
  const { code, starter } = await startRoomFromPhone(browser, "Ava");
  const [ben, cleo] = await Promise.all([
    joinPhone(browser, code, "Ben"),
    joinPhone(browser, code, "Cleo"),
  ]);
  const phones = [starter, ben, cleo];
  const vip = await findVip(phones);
  await startGame(vip.page, "Most Likely To");

  await playOneRoundNoTv(phones);
  await expectNextRoundReady(phones[0] ?? starter);

  await closePhones(phones);
});

test("a phone reloads mid-reveal and lands on the settled state", async ({
  browser,
}) => {
  const { code, starter } = await startRoomFromPhone(browser, "Ava");
  const [ben, cleo] = await Promise.all([
    joinPhone(browser, code, "Ben"),
    joinPhone(browser, code, "Cleo"),
  ]);
  const phones = [starter, ben, cleo];
  const vip = await findVip(phones);
  await startGame(vip.page, "Most Likely To");

  await Promise.all(
    phones.map((phone) =>
      expect(
        phone.page.getByRole("button", { name: /Lock in vote/ }),
      ).toBeVisible({ timeout: 45_000 }),
    ),
  );
  await Promise.all(
    phones.map(async (phone) => {
      await phone.page.locator("button.opg-reset").first().click();
      await phone.page.getByRole("button", { name: /Lock in vote/ }).click();
    }),
  );

  const reloaded = ben;
  await expect(reloaded.page.getByTestId("stage-verdict-stamp")).toBeVisible({
    timeout: 45_000,
  });
  await expectSettledAfterReload(reloaded);

  await closePhones(phones);
});

test("Real or Nah shows disabled with its reason, read the same by every phone", async ({
  browser,
}) => {
  const { code, starter } = await startRoomFromPhone(browser, "Ava");
  const [ben, cleo] = await Promise.all([
    joinPhone(browser, code, "Ben"),
    joinPhone(browser, code, "Cleo"),
  ]);
  const phones = [starter, ben, cleo];
  const vip = await findVip(phones);

  await vip.page
    .locator("button[aria-pressed]")
    .filter({ hasText: "Real or Nah" })
    .click();
  await expect(
    vip.page
      .locator("button[aria-pressed]")
      .filter({ hasText: "Real or Nah" })
      .getByText("Plays on a shared screen."),
  ).toBeVisible();
  await expect(
    vip.page.getByText(
      "Real or Nah plays on a shared screen. Turn that on to start it.",
    ),
  ).toBeVisible();

  const others = phones.filter((phone) => phone !== vip);
  await Promise.all(
    others.map((phone) =>
      expect(phone.page.getByText("Plays on a shared screen.")).toBeVisible(),
    ),
  );

  await closePhones(phones);
});
