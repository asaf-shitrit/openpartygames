// Words that are in the page but not on screen, checked inside the page.
//
// The shape of the bug this exists for: a game's whole TV body collapsed to zero height under
// its frame, `overflow: hidden` clipped it away, and every element was still "visible" to
// Playwright and to the layout invariants. Nothing a player needed was on the screen.
//
// Plain browser JavaScript on purpose, injected with addScriptTag like e2e/layout/invariants.js.

/** @param {Element} element @returns {boolean} */
function clips(element) {
  const { overflowX, overflowY } = getComputedStyle(element);
  return [overflowX, overflowY].some((value) => value === "hidden" || value === "clip");
}

/** @param {DOMRect} inner @param {DOMRect} outer @returns {boolean} */
function outside(inner, outer) {
  return (
    inner.right <= outer.left ||
    inner.left >= outer.right ||
    inner.bottom <= outer.top ||
    inner.top >= outer.bottom
  );
}

/** True when a clipping, non-scrolling ancestor leaves none of `element` in view. */
function clippedBy(element) {
  const rect = element.getBoundingClientRect();
  for (let up = element.parentElement; up !== null; up = up.parentElement) {
    if (clips(up) && outside(rect, up.getBoundingClientRect())) return true;
  }
  return false;
}

/**
 * Fixed and sticky chrome (a footer, a banner) legitimately sits over a scrolling page. Only
 * chrome that does not contain `heading` counts: the TV's whole stage is `position: fixed` and
 * holds every heading, so a walk that stopped at any fixed ancestor could never fail there.
 */
function isChromeOver(hit, heading) {
  for (let up = hit; up !== null; up = up.parentElement) {
    const { position } = getComputedStyle(up);
    if ((position === "fixed" || position === "sticky") && !up.contains(heading)) return true;
  }
  return false;
}

/** The product of every ancestor's opacity: a faded-out parent hides a child that says 1. */
function effectiveOpacity(element) {
  let opacity = 1;
  for (let up = element; up !== null; up = up.parentElement) {
    opacity *= Number(getComputedStyle(up).opacity);
  }
  return opacity;
}

/** Text a player can see in principle: sized, shown, and not marked aria-hidden. */
function isShownText(element) {
  if (element.children.length > 0) return false;
  if ((element.textContent ?? "").trim() === "") return false;
  const rect = element.getBoundingClientRect();
  // Screen-reader-only text is a 1px box on purpose.
  if (rect.width < 4 || rect.height < 4) return false;
  const style = getComputedStyle(element);
  if (style.visibility === "hidden" || style.display === "none") return false;
  // Mid fade-in (a phase entering) is moving, not missing: only judge what has settled in.
  if (effectiveOpacity(element) < 0.99) return false;
  return element.closest("[aria-hidden='true'], [hidden]") === null;
}

/** @returns {string[]} */
function clippedText() {
  return Array.from(document.querySelectorAll("body *"))
    .filter((element) => isShownText(element) && clippedBy(element))
    .map((element) => `clipped away: "${(element.textContent ?? "").trim().slice(0, 40)}"`);
}

/** @param {number} x @param {number} y @returns {boolean} */
function inViewport(x, y) {
  return x >= 0 && y >= 0 && x < innerWidth && y < innerHeight;
}

/** The element a tap at the heading's centre would reach, or undefined when it is off screen. */
function hitAtCentre(heading) {
  const rect = heading.getBoundingClientRect();
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  // Below the fold of a page that scrolls is not clipped.
  return inViewport(x, y) ? document.elementFromPoint(x, y) : undefined;
}

/** A heading in view whose centre hits something else, other than sticky chrome. */
function headingUnpainted(heading) {
  const rect = heading.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return false;
  if (effectiveOpacity(heading) < 0.99) return false;
  const hit = hitAtCentre(heading);
  if (hit === undefined) return false;
  if (hit === null) return true;
  if (isChromeOver(hit, heading)) return false;
  return !(heading.contains(hit) || hit.contains(heading));
}

/** @returns {string[]} */
function unpaintedHeadings() {
  return Array.from(document.querySelectorAll("h1, h2, h3, [role='heading']"))
    .filter(headingUnpainted)
    .map((heading) => `heading not painted: "${(heading.textContent ?? "").trim().slice(0, 40)}"`);
}

/** @param {DOMRect} a @param {DOMRect} b @returns {boolean} */
function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Text and controls whose box overlaps `region`, apart from what is inside it. */
function underRegion(region) {
  const box = region.getBoundingClientRect();
  return Array.from(document.querySelectorAll("body *"))
    .filter((element) => !region.contains(element))
    .filter((element) => element.matches("button, a, input, textarea, [role=button]") || isShownText(element))
    .filter((element) => overlaps(element.getBoundingClientRect(), box))
    .map((element) => (element.textContent ?? element.tagName).trim().slice(0, 40));
}

window.opgPainted = {
  /**
   * What sits under the `<output>` whose text matches `pattern` (a fixed banner would cover it).
   * @param {string} pattern @returns {string[]}
   */
  underBanner(pattern) {
    const banner = Array.from(document.querySelectorAll("output")).find((o) =>
      new RegExp(pattern).test(o.textContent ?? ""),
    );
    return banner === undefined ? ["no banner on the page"] : underRegion(banner);
  },

  /** @returns {string[]} */
  problems() {
    return [...clippedText(), ...unpaintedHeadings()];
  },
};
