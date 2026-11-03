// Counts what one walk through the app makes a person do: screens shown, taps made and
// typed fields filled. Injected with addInitScript, so it is in place before the app renders
// and it counts a navigation from zero.
//
// A screen is the app's own idea of one. HostApp and PlayerApp both remount a
// `.opg-phase-enter` wrapper whenever the screen key changes (apps/web/src/screens/
// screen-key.ts, PlayerApp.tsx), so a screen that lands as a new component counts without
// this file or a spec naming it. The two pre-room screens — the landing page and the join
// form — carry no `.opg-phase-enter`, so their `<main>` is the screen.

(function install() {
  if ("opgMeter" in window) return;

  /** @type {{ screens: number, taps: number, fields: number, screen: HTMLElement | null }} */
  const state = { screens: 0, taps: 0, fields: 0, screen: null };
  /** @type {WeakSet<HTMLElement>} */
  const fields = new WeakSet();

  /** The element that stands for the screen on show right now. @returns {HTMLElement | null} */
  function screenNode() {
    return (
      document.querySelector(".opg-phase-enter") ??
      document.querySelector("main")
    );
  }

  /** One screen per distinct element: a real screen swap replaces the wrapper, so the same
   * screen re-rendering its content never counts twice. */
  function observeScreen() {
    const node = screenNode();
    if (node === null || node === state.screen) return;
    state.screen = node;
    state.screens += 1;
  }

  /** A tap a person made. A script's own `element.click()` is not one. @param {Event} event */
  function countTap(event) {
    if (!event.isTrusted) return;
    state.taps += 1;
  }

  /** A typed field counts once, however many keystrokes land in it. @param {Event} event */
  function countField(event) {
    const target = event.target;
    if (
      !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
    ) {
      return;
    }
    if (fields.has(target)) return;
    fields.add(target);
    state.fields += 1;
  }

  document.addEventListener("click", countTap, true);
  document.addEventListener("input", countField, true);
  // `document`, not `document.documentElement`: an init script runs before the parser has
  // created the root element, and observing a null node throws away the whole meter.
  new MutationObserver(observeScreen).observe(document, {
    childList: true,
    subtree: true,
  });
  observeScreen();

  window.opgMeter = {
    snapshot() {
      observeScreen();
      return { screens: state.screens, taps: state.taps, fields: state.fields };
    },
  };
})();
