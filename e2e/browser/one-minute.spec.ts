// What goal 1's one-minute budget actually costs today: screens, taps and typed fields from
// the landing page to the first game phase, for the starter and a joiner, in both room modes.
//
// It records rather than asserts. The deliverable is `e2e/browser/one-minute/*.md`, rewritten
// by every run and committed alongside the code, so a step that lands in the app changes a
// number there instead of passing unnoticed. The only thing that can fail here is never
// reaching the first game phase at all.
import { expect, type Page } from "@playwright/test";
import { test } from "@playwright/test";
import { expectTvLobby, joinPhone, startGame } from "./harness";
import {
  METER_PATH,
  OneMinutePath,
  formatRecord,
  meteredPhone,
  printRecord,
  seconds,
  writeRecord,
} from "./one-minute";

const GAME = "Most Likely To";
const PHONE_FIRST_PHASE = /Lock in vote/;
const TV_FIRST_PHASE = "Vote for anyone, even yourself";
const WAIT = 45_000;

/** The first phase of the game the room just started, on a phone. */
async function expectPhoneFirstPhase(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: PHONE_FIRST_PHASE })).toBeVisible({
    timeout: WAIT,
  });
}

/** A round code is the last path segment of the room URL. */
function codeOn(page: Page): string {
  const code = page.url().split("/").pop() ?? "";
  expect(code).toMatch(/^[A-Z]{4}$/);
  return code;
}

/** Types a code and a name on `/join`, marking each interval of the walk. */
async function joinThroughTheForm(
  walk: OneMinutePath,
  code: string,
  name: string,
): Promise<void> {
  await walk.page.goto("/join");
  await walk.page.getByLabel("Room code").waitFor();
  await walk.mark("opened /join, the room-code form");
  await walk.page.getByLabel("Room code").fill(code);
  await walk.page.getByLabel("Your name").fill(name);
  await walk.mark("typed the code and a name");
  await walk.page.getByRole("button", { name: "Join" }).click();
  await expect(walk.page.getByRole("button", { name: "That's me" })).toBeVisible();
  await walk.mark("tapped Join, the avatar picker is up");
  await walk.page.getByRole("button", { name: "That's me" }).click();
}

/** The TV opens the room and its lobby goes up. */
async function startRoomOnTv(walk: OneMinutePath): Promise<string> {
  await walk.page.goto("/");
  await expect(walk.page.getByText("Party games for")).toBeVisible();
  await walk.mark("landing");
  await walk.page.getByRole("button", { name: /Start a room/ }).click();
  await walk.page.waitForURL(/\/host\/[A-Z]{4}$/);
  const code = codeOn(walk.page);
  await expectTvLobby(walk.page, code);
  await walk.mark("tapped Start a room, its lobby is up");
  return code;
}

/** The shared-screen room's critical path: the TV's walk plus the starter's. */
function roomPathNote(host: OneMinutePath, starter: OneMinutePath): string {
  const total = seconds(host.total) + seconds(starter.total);
  return [
    `The room reaches its first game phase after the TV's walk and then the starter's, so they`,
    `add up: ${total}s. Anyone else joins while the starter waits in the lobby, so the joiner's`,
    `walk runs alongside theirs.`,
  ].join("\n");
}

test("the shared-screen path, from the TV landing to the first game phase", async ({
  page,
  browser,
}) => {
  await page.addInitScript({ path: METER_PATH });
  const host = new OneMinutePath(page, "host (TV)");
  const code = await startRoomOnTv(host);

  const starter = await meteredPhone(browser, "starter (phone)");
  await joinThroughTheForm(starter, code, "Ava");
  await expect(starter.page.getByText("You're the VIP")).toBeVisible();
  await starter.mark("avatar picked, the VIP lobby");

  const joiner = await meteredPhone(browser, "joiner (phone)");
  await joinThroughTheForm(joiner, code, "Ben");
  await expect(joiner.page.getByText("You're in!")).toBeVisible();
  await joiner.mark("avatar picked, the lobby");
  // The game deals to three players; the record follows the starter and a joiner only.
  const third = await joinPhone(browser, code, "Cleo");

  await startGame(starter.page, GAME);
  await expectPhoneFirstPhase(starter.page);
  await starter.mark(`picked a game, started it, the first phase of ${GAME} is up`);
  await expectPhoneFirstPhase(joiner.page);
  await joiner.mark("first game phase");
  await expect(page.getByText(TV_FIRST_PHASE).first()).toBeVisible({ timeout: WAIT });
  await host.mark("first game phase");
  const record = formatRecord({
    title: "The one-minute path: with a shared screen",
    note: roomPathNote(host, starter),
    paths: [host, starter, joiner],
  });
  printRecord(record);
  writeRecord("shared-screen", record);

  await starter.page.context().close();
  await joiner.page.context().close();
  await third.context.close();
});

test("the no-TV path, from a phone landing to the first game phase", async ({
  browser,
}) => {
  const starter = await meteredPhone(browser, "starter (phone)");
  await starter.page.goto("/");
  await expect(starter.page.getByText("Party games for")).toBeVisible();
  await starter.mark("landing");
  await starter.page.getByRole("button", { name: /Start a room/ }).click();
  await starter.page.waitForURL(/\/[A-Z]{4}$/);
  const code = codeOn(starter.page);
  await starter.page.getByLabel("Your name").waitFor();
  await starter.mark("tapped Start a room, the join form is up with the code filled in");
  await starter.page.getByLabel("Your name").fill("Ava");
  await starter.mark("typed a name");
  await starter.page.getByRole("button", { name: "Join" }).click();
  await expect(starter.page.getByRole("button", { name: "That's me" })).toBeVisible();
  await starter.mark("tapped Join, the avatar picker is up");
  await starter.page.getByRole("button", { name: "That's me" }).click();
  await expect(starter.page.getByText("You're the VIP")).toBeVisible();
  await starter.mark("avatar picked, the VIP lobby");

  const joiner = await meteredPhone(browser, "joiner (phone)");
  await joinThroughTheForm(joiner, code, "Ben");
  await expect(joiner.page.getByText("You're in!")).toBeVisible();
  await joiner.mark("avatar picked, the lobby");
  // The game deals to three players; the record follows the starter and a joiner only.
  const third = await joinPhone(browser, code, "Cleo");

  await startGame(starter.page, GAME);
  await expectPhoneFirstPhase(starter.page);
  await starter.mark(`picked a game, started it, the first phase of ${GAME} is up`);
  await expectPhoneFirstPhase(joiner.page);
  await joiner.mark("first game phase");

  const record = formatRecord({
    title: "The one-minute path: no TV",
    note: [
      "The starter's own walk is the whole room's: there is no screen to set up first.",
      "The joiner's walk runs alongside it, from the moment the code is read out.",
    ].join("\n"),
    paths: [starter, joiner],
  });
  printRecord(record);
  writeRecord("no-tv", record);

  await starter.page.context().close();
  await joiner.page.context().close();
  await third.context.close();
});
