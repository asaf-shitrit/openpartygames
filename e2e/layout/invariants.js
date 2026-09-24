// The layout invariants, checked inside the page.
//
// Every rule here is meant to be true of every screen at every supported size, forever. They
// are hard invariants, not taste: a player cannot read text that left the screen, cannot tap a
// control another element covers, and cannot reach an action that sits past the bottom of a
// screen that does not scroll.
//
// Plain browser JavaScript on purpose: layout.spec.ts injects this file into the page with
// addScriptTag, so it runs against real layout with no bundler and no build step between what
// is written here and what the browser runs.

/**
 * @typedef {{ minFontSize: number, minTapTarget: number }} Limits
 *   minFontSize: smallest computed font-size a text-bearing element may use.
 *   minTapTarget: smallest side of an interactive element's box; 0 turns the rule off.
 * @typedef {{ rule: string, detail: string, path: string, text: string }} Violation
 *   path: a readable path to the element. text: its own text, to identify it at a glance.
 */

/** A pixel of slack: browsers report fractional rects, and a half-pixel is not a bug. */
const EPS = 1;

const INTERACTIVE = 'button, a[href], input, textarea, select, [role="button"]';

/** @param {Element} el @returns {string} */
function pathOf(el) {
  const parts = [];
  let node = el;
  while (node && node !== document.body && parts.length < 4) {
    const testId = node.getAttribute("data-testid");
    const id = testId ? `[data-testid=${testId}]` : "";
    parts.unshift(`${node.tagName.toLowerCase()}${id}`);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

/** @param {Element} el @returns {string} */
function textOf(el) {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
}

/** @param {string} rule @param {Element} el @param {string} detail @returns {Violation} */
function violation(rule, el, detail) {
  return { rule, detail, path: pathOf(el), text: textOf(el) };
}

/** @param {HTMLElement} el @returns {boolean} */
function visible(el) {
  const style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  if (Number(style.opacity) < 0.05) return false;
  const rect = el.getBoundingClientRect();
  // A box this small is the visually-hidden idiom: read aloud by a screen reader, seen by
  // nobody. Measuring it as text would report every accessible label as clipped.
  return rect.width > 2 && rect.height > 2;
}

/** Text this element renders itself, rather than through a child. @param {Element} el */
function directText(el) {
  let text = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? "";
  }
  return text.trim();
}

/** @param {HTMLElement} el @returns {boolean} */
function carriesWords(el) {
  return directText(el) !== "" || el.matches(INTERACTIVE);
}

/**
 * Words and controls may not cross the left or right edge of the screen: nothing scrolls
 * sideways to reach them. Decoration may — tilted stickers and the result burst hang past the
 * edge on purpose — so this only judges elements that carry text or take a tap.
 *
 * @param {HTMLElement} el @returns {Violation | null}
 */
function checkHorizontal(el) {
  if (!carriesWords(el)) return null;
  const rect = el.getBoundingClientRect();
  if (rect.right > window.innerWidth + EPS) {
    return violation(
      "offscreen-x",
      el,
      `right edge at ${Math.round(rect.right)}px, screen is ${window.innerWidth}px`,
    );
  }
  if (rect.left < -EPS) {
    return violation("offscreen-x", el, `left edge at ${Math.round(rect.left)}px`);
  }
  return null;
}

/**
 * A box that clips and holds content wider than itself is cutting text off. Boxes that let
 * content show through (overflow visible) are the design's own tilted stickers, not a bug.
 *
 * @param {HTMLElement} el @returns {Violation | null}
 */
function checkClipped(el) {
  if (el.clientWidth === 0) return null;
  const overflowX = getComputedStyle(el).overflowX;
  if (overflowX === "visible" || overflowX === "auto" || overflowX === "scroll") return null;
  if (el.scrollWidth <= el.clientWidth + EPS) return null;
  if (textOf(el) === "") return null;
  return violation(
    "text-clipped",
    el,
    `${el.scrollWidth}px of content clipped to ${el.clientWidth}px`,
  );
}

/** @param {HTMLElement} el @param {Limits} limits @returns {Violation | null} */
function checkFontSize(el, limits) {
  if (directText(el) === "") return null;
  const size = Number.parseFloat(getComputedStyle(el).fontSize);
  if (size >= limits.minFontSize - 0.5) return null;
  return violation("text-too-small", el, `${size}px, floor is ${limits.minFontSize}px`);
}

/** @param {HTMLElement} el @param {Limits} limits @returns {Violation | null} */
function checkTapTarget(el, limits) {
  if (limits.minTapTarget === 0) return null;
  const rect = el.getBoundingClientRect();
  const side = Math.min(rect.width, rect.height);
  if (side >= limits.minTapTarget - EPS) return null;
  return violation(
    "tap-target",
    el,
    `${Math.round(rect.width)}x${Math.round(rect.height)}px, floor is ${limits.minTapTarget}px`,
  );
}

/** After scrolling to it, an action must actually be on the screen. @param {HTMLElement} el */
function checkReachable(el) {
  const rect = el.getBoundingClientRect();
  if (rect.bottom <= window.innerHeight + EPS && rect.top >= -EPS) return null;
  return violation(
    "unreachable",
    el,
    `sits at ${Math.round(rect.top)}..${Math.round(rect.bottom)}px in a ${window.innerHeight}px screen that will not scroll to it`,
  );
}

/** Whatever is on top at a control's centre has to be that control. @param {HTMLElement} el */
function checkCovered(el) {
  const rect = el.getBoundingClientRect();
  const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  if (top === null) return violation("covered", el, "nothing hit-tests at its centre");
  if (top === el || el.contains(top)) return null;
  return violation("covered", el, `${pathOf(top)} is on top at its centre`);
}

/** @param {HTMLElement} el @param {Limits} limits @returns {Violation[]} */
function checkInteractive(el, limits) {
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
  const reachable = checkReachable(el);
  const found = [reachable ?? checkCovered(el), checkTapTarget(el, limits)];
  return found.filter((each) => each !== null);
}

/** A screen that scrolls sideways is broken outright. @returns {Violation[]} */
function checkPageWidth() {
  const doc = document.documentElement;
  if (doc.scrollWidth <= window.innerWidth + EPS) return [];
  return [
    {
      rule: "page-scrolls-sideways",
      detail: `${doc.scrollWidth}px of page in a ${window.innerWidth}px screen`,
      path: "html",
      text: "",
    },
  ];
}

/** @param {Limits} limits @returns {Violation[]} */
function collectViolations(limits) {
  const elements = Array.from(document.body.querySelectorAll("*")).filter(visible);
  const found = [...checkPageWidth()];
  for (const el of elements) {
    found.push(checkHorizontal(el), checkClipped(el), checkFontSize(el, limits));
  }
  for (const el of elements) {
    if (el.matches(INTERACTIVE)) found.push(...checkInteractive(el, limits));
  }
  window.scrollTo(0, 0);
  return found.filter((each) => each !== null);
}

window.opgLayout = { collectViolations };
