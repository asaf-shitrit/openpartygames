// Full Doodle Bluff game: one TV page plus three phone pages, all real UI, plus a reload mid-draw
// to prove the sessionStorage mirror (plan/0003-doodle-bluff.md, "The phone drawing pad", D6).
import { expect, test } from "@playwright/test";
import {
  expectTvLobby,
  findVip,
  joinPhones,
  startGame,
  startRoom,
} from "./harness";
import { drawOneStroke, joinPhonesForReloadTest, playDoodleBluff } from "./doodle-bluff";
import { assertLayout } from "./layout-check";

test("three phones play a full Doodle Bluff game on the TV", async ({
  page,
  browser,
}) => {
  const code = await startRoom(page);
  await expectTvLobby(page, code);

  const phones = await joinPhones(browser, page, code, ["Ava", "Ben", "Cleo"]);
  const vip = await findVip(phones);
  await startGame(vip.page, "Doodle Bluff");

  await playDoodleBluff(page, phones, vip);

  const shownTags = page.getByText(/never shown|Found by/);
  await expect(shownTags).toHaveCount(6);

  await Promise.all(phones.map((phone) => phone.context.close()));
});

test("a phone reloads mid-draw and its strokes survive", async ({
  page,
  browser,
}) => {
  const code = await startRoom(page);
  await expectTvLobby(page, code);

  const phones = await joinPhonesForReloadTest(browser, page, code, [
    "Ava",
    "Ben",
    "Cleo",
  ]);
  const vip = await findVip(phones);
  await startGame(vip.page, "Doodle Bluff");
  await expect(page.getByText("Everyone is drawing")).toBeVisible({
    timeout: 45_000,
  });

  const drawer = phones[0];
  if (!drawer) throw new Error("missing first phone");
  await drawOneStroke(drawer.page);
  await drawer.page.reload();

  await expect(drawer.page.locator("canvas:visible")).toBeVisible({
    timeout: 30_000,
  });
  // The pad states its own stroke count next to the canvas, so the count itself is the
  // assertion — not just that some control came back enabled.
  await expect(drawer.page.getByText(/: 1 stroke so far/)).toBeAttached({
    timeout: 30_000,
  });
  await expect(
    drawer.page.getByRole("button", { name: "Undo" }),
  ).toBeEnabled({ timeout: 30_000 });
  // The state a preview fixture cannot produce: a phone that has just come back from a
  // reload, mid-draw, with its mirrored strokes restored — not a screen anyone mounts fresh.
  await assertLayout(drawer.page, "phone", "doodle-bluff draw phase after a mid-draw reload");

  await Promise.all(phones.map((phone) => phone.context.close()));
});
