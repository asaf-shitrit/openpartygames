// Shared browser driving for the e2e suite: create a room on the TV, join
// phones through the real join/avatar flow, pick a game and assert the lobby.

import {
  devices,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { INVARIANTS_PATH } from "./layout-check";

export interface Phone {
  name: string;
  context: BrowserContext;
  page: Page;
}

/** A phone-shaped context: reduced motion (so an in-play layout check never lands mid
 * transition, see layout-check.ts) and the layout checker injected on every navigation,
 * including a later `page.reload()`, so a check right after a reload never needs the
 * on-demand fallback in layout-check.ts's `ensureInjected`. */
export async function newPhonePage(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ...devices["Pixel 5"], reducedMotion: "reduce" });
  await context.addInitScript({ path: INVARIANTS_PATH });
  const page = await context.newPage();
  return { context, page };
}

/** Desktop TV page, then "Start a room"; returns the new room code. */
export async function startRoom(tv: Page): Promise<string> {
  await tv.goto("/");
  await expect(tv.getByText("Party games for")).toBeVisible();
  await tv.getByRole("button", { name: /Start a room/ }).click();
  await tv.waitForURL(/\/host\/[A-Z]{4}$/);
  const code = tv.url().split("/").pop() ?? "";
  expect(code).toMatch(/^[A-Z]{4}$/);
  return code;
}

/** A phone lands on "/", starts a room with no shared screen and becomes its VIP. */
export async function startRoomFromPhone(
  browser: Browser,
  name: string,
): Promise<{ code: string; starter: Phone }> {
  const { context, page } = await newPhonePage(browser);
  await page.goto("/");
  await expect(page.getByText("Party games for")).toBeVisible();
  await page.getByRole("button", { name: /Start a room/ }).click();
  await page.waitForURL(/\/[A-Z]{4}$/);
  const code = page.url().split("/").pop() ?? "";
  expect(code).toMatch(/^[A-Z]{4}$/);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Join" }).click();
  await page.getByRole("button", { name: "That's me" }).click();
  await expect(page.getByText("You're the VIP")).toBeVisible();
  return { code, starter: { name, context, page } };
}

/** Waits for the TV lobby, which is what phones scan the room code off. */
export async function expectTvLobby(tv: Page, code: string): Promise<void> {
  await expect(tv.getByText("Grab your phone!")).toBeVisible();
  await expect(
    tv.locator(".opg-marker").filter({ hasText: code }),
  ).toBeVisible();
}

/** Opens /<CODE> on a phone viewport, joins with `name` and leaves the avatar picker. */
export async function joinPhone(
  browser: Browser,
  code: string,
  name: string,
): Promise<Phone> {
  const { context, page } = await newPhonePage(browser);
  await page.goto(`/${code}`);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Join" }).click();
  await page.getByRole("button", { name: "That's me" }).click();
  await expect(
    page.getByText("You're in!").or(page.getByText("You're the VIP")),
  ).toBeVisible();
  return { name, context, page };
}

/** Joins one phone per name in parallel and waits for every lobby tile on the TV. */
export async function joinPhones(
  browser: Browser,
  tv: Page,
  code: string,
  names: string[],
): Promise<Phone[]> {
  const phones = await Promise.all(
    names.map((name) => joinPhone(browser, code, name)),
  );
  await expect(tv.getByText("Who's here")).toBeVisible();
  await Promise.all(
    names.map((name) =>
      expect(tv.getByText(name, { exact: true }).first()).toBeVisible(),
    ),
  );
  return phones;
}

/** The phone whose lobby shows the VIP controls; the first join wins. */
export async function findVip(phones: Phone[]): Promise<Phone> {
  const claims = await Promise.all(
    phones.map(async (phone) => ({
      phone,
      isVip: await phone.page.getByText("You're the VIP").isVisible(),
    })),
  );
  const vip = claims.find((claim) => claim.isVip)?.phone;
  if (!vip) throw new Error("no phone showed the VIP lobby");
  return vip;
}

/** The VIP picks `gameName` and starts it. */
export async function startGame(vip: Page, gameName: string): Promise<void> {
  const gameButton = vip
    .locator("button[aria-pressed]")
    .filter({ hasText: gameName });
  await gameButton.click();
  const startButton = vip.getByRole("button", { name: `Start ${gameName}` });
  await expect(startButton).toBeEnabled();
  await startButton.click();
}

/** Final scores are up and at least one winner earned a crown. */
export async function expectFinalScores(tv: Page): Promise<void> {
  await expect(
    tv.locator(".opg-marker").filter({ hasText: "Final scores" }),
  ).toBeVisible({ timeout: 60_000 });
  // The finale ceremony lands the crown about 19–25s after the game ends; ties share it.
  await expect(tv.getByText(/(wins|share) the crown/).first()).toBeVisible({
    timeout: 60_000,
  });
}

/** Runs `action` `count` times; recursion keeps the await out of a loop. */
export async function repeat(
  count: number,
  action: () => Promise<void>,
): Promise<void> {
  if (count <= 0) return;
  await action();
  await repeat(count - 1, action);
}
