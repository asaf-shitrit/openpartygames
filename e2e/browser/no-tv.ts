// Play-through driving for Most Likely To with no TV page open: every phone carries the
// shared stage on its own screen, read off `stage-*` testids instead of the TV.

import { expect } from "@playwright/test";
import { assertLayout } from "./layout-check";
import type { Phone } from "./harness";

/** Waits until every phone's vote form is ready for the round, and checks the no-TV stage —
 * carried on the same screen as the vote controls, so this is exactly where the stage could
 * cover the tap targets beneath it. */
async function expectVoteReady(phones: Phone[]): Promise<void> {
  await Promise.all(
    phones.map(async (phone) => {
      await expect(
        phone.page.getByRole("button", { name: /Lock in vote/ }),
      ).toBeVisible({ timeout: 45_000 });
      await assertLayout(phone.page, "phone", `no-tv vote phase (${phone.name})`);
    }),
  );
}

/** Picks the top row (the first player to join) and locks in. */
async function lockVote(phone: Phone): Promise<void> {
  await phone.page.locator("button.opg-reset").first().click();
  await phone.page.getByRole("button", { name: /Lock in vote/ }).click();
}

async function lockVotes(phones: Phone[]): Promise<void> {
  await Promise.all(phones.map((phone) => lockVote(phone)));
}

async function expectPersonalCards(phones: Phone[]): Promise<void> {
  await Promise.all(
    phones.map(async (phone) => {
      await expect(phone.page.getByTestId("reveal-content")).toBeVisible({
        timeout: 45_000,
      });
      // Stage and personal card stacked on one screen — the highest-risk overlap in no-TV mode.
      await assertLayout(phone.page, "phone", `no-tv reveal phase (${phone.name})`);
    }),
  );
}

/**
 * Plays one full round with no TV page open: everyone votes for the first player, so
 * every phone's own stage must stamp a clear verdict, then each phone lands its
 * personal card off the same stage.
 */
export async function playOneRoundNoTv(phones: Phone[]): Promise<void> {
  await expectVoteReady(phones);
  await lockVotes(phones);
  const [first] = phones;
  if (!first) throw new Error("expected at least one phone");
  await expect(first.page.getByTestId("stage-verdict-stamp")).toBeVisible({
    timeout: 45_000,
  });
  await expect(first.page.getByTestId("stage-verdict-stamp")).toContainText(
    "Most likely!",
  );
  await expectPersonalCards(phones);
}

/** True once the round-2 vote form is back up (the round after a reveal has ended). */
export async function expectNextRoundReady(phone: Phone): Promise<void> {
  await expect(
    phone.page.getByRole("button", { name: /Lock in vote/ }),
  ).toBeVisible({ timeout: 45_000 });
  await assertLayout(phone.page, "phone", "no-tv next round ready");
}

/**
 * Reloads `phone` mid-reveal and asserts it lands directly on the settled state: the
 * stage's verdict stamp and this phone's own personal card are both already up, with no
 * suspense ring replaying (a beat already past does not restage its cue on reconnect).
 */
export async function expectSettledAfterReload(phone: Phone): Promise<void> {
  await phone.page.reload();
  await expect(phone.page.getByTestId("stage-verdict-stamp")).toBeVisible({
    timeout: 15_000,
  });
  await expect(phone.page.getByTestId("reveal-content")).toBeVisible({
    timeout: 15_000,
  });
  await expect(phone.page.getByText("Verdict incoming")).not.toBeVisible();
  // Exactly the state a settled preview fixture cannot stand in for: a phone that just
  // reconnected mid-reveal, with the stage and its own card both already up.
  await assertLayout(phone.page, "phone", "no-tv settled after a mid-reveal reload");
}
