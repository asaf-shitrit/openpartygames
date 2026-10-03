// The painted check has to be able to fail where it matters most: on the TV, whose whole stage
// is `position: fixed`. A check that treats anything fixed as harmless chrome passes there
// whatever is on top of a heading.
import { expect, test } from "@playwright/test";
import { expectTvLobby, startRoom } from "./harness";
import { assertLayout } from "./layout-check";

test("the painted check fails when something covers a TV heading", async ({ page }) => {
  const code = await startRoom(page);
  await expectTvLobby(page, code);
  await assertLayout(page, "tv", "TV lobby, untouched");

  // Covered from inside the stage, the way a stray element in the game's own tree would be:
  // everything in the stage has a fixed ancestor, which the check must not take as chrome.
  await page.evaluate(() => {
    const heading = document.querySelector("h1");
    const stage = heading?.closest(".opg-root");
    if (heading === null || stage === null || stage === undefined) throw new Error("no TV stage");
    const box = heading.getBoundingClientRect();
    const room = stage.getBoundingClientRect();
    const cover = document.createElement("div");
    cover.setAttribute(
      "style",
      `position:absolute;z-index:99;background:#fff;left:${box.left - room.left - 20}px;top:${box.top - room.top - 20}px;width:${box.width + 40}px;height:${box.height + 40}px`,
    );
    stage.append(cover);
  });
  await expect(assertLayout(page, "tv", "TV lobby, heading covered")).rejects.toThrow();
});
