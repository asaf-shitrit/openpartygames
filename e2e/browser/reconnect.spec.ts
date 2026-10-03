// Reconnect mid-game: a phone reloads during the write phase and rejoins by
// token, then the same fact keeps going through the real UI.
import { expect, test, type Page } from "@playwright/test";
import {
  expectTvLobby,
  findVip,
  joinPhones,
  newPhonePage,
  startGame,
  startRoom,
} from "./harness";
import { coveredByBanner } from "./layout-check";
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

/** Resizes `page` through `sizes` in turn and asserts the banner sits on nothing at each. */
async function expectBannerClear(
  page: Page,
  sizes: { width: number; height: number }[],
): Promise<void> {
  const [size, ...rest] = sizes;
  if (size === undefined) return;
  await page.setViewportSize(size);
  await page.evaluate(() => window.scrollTo(0, 0));
  // Polled: after a resize the banner re-measures on its next ResizeObserver callback, so the
  // screen moves down a frame later. A banner that keeps covering something still fails here.
  await expect.poll(() => coveredByBanner(page), { message: `at ${size.width}x${size.height}`, timeout: 2_000 }).toEqual([]);
  // A screen built to fit the phone must give the banner room out of its own flexible middle:
  // the ballot's Lock in button stays on screen, with the screen ending inside the viewport.
  const lockIn = await page.getByRole("button", { name: /Lock in vote/ }).boundingBox();
  const height = await page.evaluate(() => window.innerHeight);
  expect(lockIn, `Lock in at ${size.width}x${size.height}`).not.toBeNull();
  expect((lockIn?.y ?? 0) + (lockIn?.height ?? 0), `Lock in bottom at ${size.height}`).toBeLessThanOrEqual(height);
  expect(
    await page.evaluate(() => document.querySelector("main")?.getBoundingClientRect().bottom ?? 0),
    `screen bottom at ${size.height}`,
  ).toBeLessThanOrEqual(height);
  await expectBannerClear(page, rest);
}

test("the reconnect banner covers nothing the player needs, at every phone size", async ({
  page,
  browser,
}) => {
  const code = await startRoom(page);
  await expectTvLobby(page, code);

  // Ben's socket is proxied so the test can sever it, the way a dropped mobile connection
  // would, and keep it down. setOffline would not do: Chromium leaves an open WebSocket up.
  let severed = false;
  const live: { close: () => Promise<void> }[] = [];
  const { context, page: ben } = await newPhonePage(browser);
  await ben.routeWebSocket(/\/ws\//, (ws) => {
    if (severed) {
      void ws.close();
      return;
    }
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => ws.send(message));
    ws.onClose(() => {
      void server.close();
    });
    server.onClose(() => {
      void ws.close();
    });
    live.push({ close: () => ws.close() });
  });
  await ben.goto(`/${code}`);
  await ben.getByLabel("Your name").fill("Ben");
  await ben.getByRole("button", { name: "Join" }).click();
  await ben.getByRole("button", { name: "That's me" }).click();
  const others = await joinPhones(browser, page, code, ["Ava", "Cleo"]);
  const vip = await findVip([...others, { name: "Ben", context, page: ben }]);
  await startGame(vip.page, "Most Likely To");
  await expect(ben.getByRole("button", { name: /Lock in vote/ })).toBeVisible({ timeout: 45_000 });

  severed = true;
  await Promise.all(live.map((socket) => socket.close()));
  await expect(ben.getByText(/Reconnecting/)).toBeVisible({ timeout: 20_000 });

  await expectBannerClear(ben, [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]);

  await context.close();
  await Promise.all(others.map((phone) => phone.context.close()));
});
