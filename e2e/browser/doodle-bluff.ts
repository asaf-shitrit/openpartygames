// Play-through driving for one full Doodle Bluff game through the real phone UI. Every drawing
// but one goes through the "Can't draw? Send a squiggle" escape, so the suite stays fast and
// deterministic; one drawing is made for real with page.mouse so the pointer path, the chunk
// upload and the canvas are actually exercised. The reveal phase has no player action (it only
// ever advances on its 12s deadline), so the VIP's "Skip this part" control stands in for a fake
// clock here, the way e2e/api/room.test.ts's playDoodleBluff uses a "skip-phase" message on
// "reveal" and "gallery". The draw, title and vote phases all advance the moment every connected
// player has acted (games/doodle-bluff/src/index.ts's advanceDrawIfReady / advanceTitleIfReady /
// advanceVoteIfReady), so driving every phone keeps this from ever depending on a deadline.
import { devices, expect, type Browser, type Page } from "@playwright/test";
import { joinPhone, repeat, type Phone } from "./harness";

// shownCount(3 players) = min(2 * 3, TITLED_MAX) = 6 (games/doodle-bluff/src/state.ts)
const ROUNDS_PER_GAME = 6;

// Both of a phone's two drawings stay mounted at once (games/doodle-bluff/src/ui/PhoneDraw.tsx
// hides the inactive one with CSS, not by unmounting it), so every canvas lookup below is scoped
// to the one that is actually on screen.
function activeCanvas(page: Page) {
  return page.locator("canvas:visible");
}

async function drawStroke(page: Page): Promise<void> {
  const canvas = activeCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error("doodle pad canvas has no bounding box");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 70, cy - 70);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 20, { steps: 6 });
  await page.mouse.move(cx + 70, cy + 60, { steps: 6 });
  await page.mouse.up();
}

async function squiggleActive(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Can.t draw\? Send a squiggle/ }).click();
}

async function nextDrawing(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Next drawing" }).click();
}

/** The artist's first drawing, made for real with the mouse; the second, squiggled. */
async function drawForReal(page: Page): Promise<void> {
  await expect(activeCanvas(page)).toBeVisible({ timeout: 45_000 });
  await drawStroke(page);
  await page.getByRole("button", { name: "I'm done with this one" }).click();
  await nextDrawing(page);
  await squiggleActive(page);
}

/** Both of a phone's drawings, squiggled — the fast path most players take. */
async function squiggleBoth(page: Page): Promise<void> {
  await expect(activeCanvas(page)).toBeVisible({ timeout: 45_000 });
  await squiggleActive(page);
  await nextDrawing(page);
  await squiggleActive(page);
}

/** Draws every drawing in the game: one for real, the rest as squiggles. */
export async function playDoodleDraw(tv: Page, phones: Phone[]): Promise<void> {
  await expect(tv.getByText("Everyone is drawing")).toBeVisible({ timeout: 45_000 });
  const [artist, ...rest] = phones;
  if (artist === undefined) throw new Error("no phones to draw with");
  await drawForReal(artist.page);
  await Promise.all(rest.map((phone) => squiggleBoth(phone.page)));
  await expect(tv.getByText("Who's written")).toBeVisible({ timeout: 45_000 });
}

async function titleIfNotArtist(phone: Phone): Promise<void> {
  await expect(
    phone.page.getByText("Give it a good lie").or(phone.page.getByText("Your drawing — sit tight")),
  ).toBeVisible({ timeout: 45_000 });
  if (await phone.page.getByText("Your drawing — sit tight").isVisible()) return;
  await phone.page.getByLabel("Your title").fill(`lie from ${phone.name}`);
  await phone.page.getByRole("button", { name: "Submit title" }).click();
}

async function voteIfNotArtist(phone: Phone): Promise<void> {
  await expect(
    phone.page
      .getByText("Which title is real?")
      .or(phone.page.getByText("Your drawing — no peeking at your own title")),
  ).toBeVisible({ timeout: 45_000 });
  if (await phone.page.getByText("Your drawing — no peeking at your own title").isVisible()) return;
  await phone.page.locator("button[aria-pressed]").first().click();
  await phone.page.getByRole("button", { name: "Lock in" }).click();
}

/** One drawing's title, vote and reveal: everyone but its artist writes and votes, then the VIP
 * skips the reveal instead of waiting out its fixed 12s deadline. */
async function playRound(tv: Page, phones: Phone[], vip: Phone): Promise<void> {
  await expect(tv.getByText("Who's written")).toBeVisible({ timeout: 45_000 });
  await Promise.all(phones.map((phone) => titleIfNotArtist(phone)));
  await expect(tv.getByText("Which title is real?")).toBeVisible({ timeout: 45_000 });
  await Promise.all(phones.map((phone) => voteIfNotArtist(phone)));
  await expect(tv.getByText("Let's see who fooled who")).toBeVisible({ timeout: 45_000 });
  await vip.page.getByRole("button", { name: "Skip this part" }).click();
}

/** Draws every drawing, then plays every round through to the gallery. */
export async function playDoodleBluff(tv: Page, phones: Phone[], vip: Phone): Promise<void> {
  await playDoodleDraw(tv, phones);
  await repeat(ROUNDS_PER_GAME, () => playRound(tv, phones, vip));
  await expect(tv.getByText("The gallery — gone after tonight")).toBeVisible({ timeout: 45_000 });
}

/** Draws one real stroke on the active pad, for a test that then reloads to prove the
 * sessionStorage mirror. */
export async function drawOneStroke(page: Page): Promise<void> {
  await expect(activeCanvas(page)).toBeVisible({ timeout: 45_000 });
  await drawStroke(page);
}

/** A local wrangler dev + Durable Object round-trips a "strokes" action fast enough that, by the
 * time a real reload has fetched the page and reconnected, the server has usually already acked
 * it — which would pass this phone's own local race every time and prove nothing about the
 * mirror. Routing the WebSocket lets the test drop that one action before it ever reaches the
 * server, standing in for the dropped-send a flaky mobile network would cause for real
 * (plan/0003-doodle-bluff.md, "The phone drawing pad", D6): the mirror is all that's left to
 * survive the reload. Everything else — join, avatar pick, other actions — still round-trips.
 */
async function joinDrawer(browser: Browser, code: string, name: string): Promise<Phone> {
  const context = await browser.newContext({ ...devices["Pixel 5"] });
  const page = await context.newPage();
  await page.routeWebSocket(/\/ws\//, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      if (message.toString().includes('"type":"strokes"')) return;
      server.send(message);
    });
  });
  await page.goto(`/${code}`);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Join" }).click();
  await page.getByRole("button", { name: "That's me" }).click();
  await expect(
    page.getByText("You're in!").or(page.getByText("You're the VIP")),
  ).toBeVisible();
  return { name, context, page };
}

/** Joins the drawer (its "strokes" action never reaches the server) plus the rest of the room. */
export async function joinPhonesForReloadTest(
  browser: Browser,
  tv: Page,
  code: string,
  names: string[],
): Promise<Phone[]> {
  const [drawerName, ...rest] = names;
  if (drawerName === undefined) throw new Error("no names to join");
  const phones = await Promise.all([
    joinDrawer(browser, code, drawerName),
    ...rest.map((name) => joinPhone(browser, code, name)),
  ]);
  await expect(tv.getByText("Who's here")).toBeVisible();
  await Promise.all(
    names.map((name) => expect(tv.getByText(name, { exact: true }).first()).toBeVisible()),
  );
  return phones;
}
