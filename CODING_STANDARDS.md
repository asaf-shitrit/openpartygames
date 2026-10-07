# Coding standards

Read when reviewing a diff. Each rule is a judgement call the linter cannot make; anything mechanical is already enforced by `pnpm lint`. Report every rule the diff breaks, with the file and line.

## Room state survives a restart

A deploy restarts every Durable Object mid-game. Anything `apps/worker/src/room-hub.ts` needs after a restart (a deadline, a grace window, a pending alarm) is written to storage, as `graceUntil` (`GRACE_KEY`) is, never held only in a field or a closure. The change comes with a test that restarts the hub mid-window through `restartHub` in `apps/worker/src/fixtures/hub.ts` and asserts the window still ends.

## Hebrew copy is gender-neutral

A Hebrew line reads correctly for any player and any group. Address the player with a noun phrase or an infinitive ("— בחירת המשחק", "עכשיו בתור"), never a masculine or feminine verb form or a slash form (בוחר/ת). It is real, idiomatic Hebrew, as short and warm as the English. Names and other left-to-right runs inside a Hebrew sentence go through the bidi helpers in `packages/i18n/src/format.ts`.

## Browser assertions wait for the page to settle

After anything that changes the page asynchronously (a resize, a reconnect, a new view), assert with a web-first matcher (`toBeVisible`, `toHaveText`) or `expect.poll`, never a single `page.evaluate` sample. A one-shot measurement races the next layout frame and flakes.

## Tests outlive the content

A test asserts behaviour that stays true as packs and games grow. A refusal path ("no pack for this language") gets a fixture built for it, as `packages/sdk/src/room.test.ts` does for `no-language-packs`, rather than relying on shipped content being absent.

## A regression test can fail

A test added for a bug drives the exact path that broke and fails on the code before the fix. A test that would pass with the fix reverted measured nothing; flag it.

Prove it with `git stash push -- <the source paths, not the test>`: the fix goes away, the new test stays, run it and watch it fail, then `git stash pop`. Stashing by path returns each file to where it came from, so a fix spanning files that share a basename across directories (`en/realOrNah.ts` and `he/realOrNah.ts`) round-trips intact — copying those into one scratch directory keeps only whichever landed second, and restores it over its sibling.
