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
/**
 * The visually-hidden idiom: a clipped one-pixel box, pulled out of flow, that a screen reader
 * reads and nobody sees. Recognised by what it *is* rather than by how small it measures — at
 * 200% zoom that one pixel renders as two, and a size threshold alone then starts reporting
 * every accessible label in the app as clipped text.
 *
 * @param {HTMLElement} el @param {CSSStyleDeclaration} style @returns {boolean}
 */
function screenReaderOnly(el, style) {
  if (style.position !== "absolute" && style.position !== "fixed") return false;
  const clipped = style.clipPath !== "none" || (style.clip !== "auto" && style.clip !== "");
  if (!clipped && style.overflow !== "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width <= 4 && rect.height <= 4;
}

/** @param {HTMLElement} el @returns {boolean} */
function visible(el) {
  const style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  if (Number(style.opacity) < 0.05) return false;
  if (screenReaderOnly(el, style)) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
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
/**
 * The widest right edge of any text this element actually renders, relative to its own box. A
 * box's scrollWidth counts everything inside it, decoration included, and this design hangs
 * decoration past its edges on purpose — tilted stickers, a celebration burst — behind an
 * `overflow: hidden` that exists precisely to contain them. Measuring that as clipped text
 * reports a card as broken for doing the thing it was built to do.
 *
 * @param {HTMLElement} el @returns {number}
 */
function textRightEdge(el) {
  const left = el.getBoundingClientRect().left;
  let widest = 0;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walk.nextNode(); node !== null; node = walk.nextNode()) {
    if ((node.textContent ?? "").trim() === "") continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      widest = Math.max(widest, rect.right - left);
    }
  }
  return widest;
}

/** @param {HTMLElement} el @returns {Violation | null} */
function checkClipped(el) {
  if (el.clientWidth === 0) return null;
  const overflowX = getComputedStyle(el).overflowX;
  if (overflowX === "visible" || overflowX === "auto" || overflowX === "scroll") return null;
  if (el.scrollWidth <= el.clientWidth + EPS) return null;
  if (textOf(el) === "") return null;
  const textEdge = textRightEdge(el);
  if (textEdge <= el.clientWidth + EPS) return null;
  return violation(
    "text-clipped",
    el,
    `text reaches ${Math.round(textEdge)}px in a ${el.clientWidth}px box`,
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

// --- Accessibility invariants -----------------------------------------------------------
//
// These are checked separately from collectViolations, by a11y.spec.ts, at fewer sizes: they
// do not depend on viewport width the way layout does, so running them at every phone size
// would just repeat the same answer for more cost.

/**
 * Every id in aria-labelledby, joined. Empty if the attribute is absent, points at nothing, or
 * every target is itself empty. @param {Element} el @returns {string}
 */
function resolveLabelledBy(el) {
  const ids = (el.getAttribute("aria-labelledby") ?? "").trim();
  if (ids === "") return "";
  return ids
    .split(/\s+/)
    .map((id) => document.getElementById(id))
    .filter((node) => node !== null)
    .map((node) => (node.textContent ?? "").trim())
    .filter((text) => text !== "")
    .join(" ");
}

/** A <label for=id> naming el, or el's nearest wrapping <label>. @param {Element} el */
function resolveAssociatedLabel(el) {
  if (el.id) {
    const target = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    const text = (target?.textContent ?? "").trim();
    if (text !== "") return text;
  }
  const wrapping = el.closest("label");
  return (wrapping?.textContent ?? "").trim();
}

/**
 * A form field's own name: an associated <label>, or a button-like input's value — the input
 * itself never has text content to fall back on. @param {Element} el @returns {string}
 */
function fieldNameOf(el) {
  const associated = resolveAssociatedLabel(el);
  if (associated !== "") return associated;
  const type = (el.getAttribute("type") ?? "text").toLowerCase();
  if (el.tagName.toLowerCase() === "input" && ["button", "submit", "reset"].includes(type)) {
    return (el.getAttribute("value") ?? "").trim();
  }
  return "";
}

/**
 * The name a screen reader would announce for a control: aria-label, aria-labelledby, an
 * associated <label> for a form field (or its value, for a button-like input), else the
 * control's own text content. Empty when none of those give it one.
 *
 * @param {Element} el @returns {string}
 */
function accessibleNameOf(el) {
  const ariaLabel = (el.getAttribute("aria-label") ?? "").trim();
  if (ariaLabel !== "") return ariaLabel;
  const labelledBy = resolveLabelledBy(el);
  if (labelledBy !== "") return labelledBy;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return fieldNameOf(el);
  return (el.textContent ?? "").trim();
}

/**
 * A control with no accessible name is invisible to a screen reader: an icon-only button that
 * relies on its shape to be understood by anyone not looking at it. This is a rule, not a
 * preference, because there is no visual signal that catches the gap — the button looks fine.
 *
 * @param {HTMLElement} el @returns {Violation | null}
 */
function checkAccessibleName(el) {
  if (accessibleNameOf(el) !== "") return null;
  return violation(
    "no-accessible-name",
    el,
    "no text, aria-label, aria-labelledby or associated <label>",
  );
}

/** @returns {Violation[]} */
function collectNameViolations() {
  const elements = Array.from(document.body.querySelectorAll("*")).filter(visible);
  const found = [];
  for (const el of elements) {
    if (!el.matches(INTERACTIVE)) continue;
    const missing = checkAccessibleName(el);
    if (missing) found.push(missing);
  }
  return found;
}

/** @typedef {{ r: number, g: number, b: number, a: number }} Rgba */

/** @param {string} raw @returns {Rgba | null} */
function parseColor(raw) {
  const match = raw.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(",").map((part) => Number.parseFloat(part));
  const [r, g, b, a = 1] = parts;
  if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
  return { r, g, b, a };
}

/** @param {Rgba} fg @param {{r:number,g:number,b:number}} bg @returns {{r:number,g:number,b:number}} */
function compositeOver(fg, bg) {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
  };
}

/**
 * The opaque colour actually painted behind an element, found by walking up to the nearest
 * ancestor (self included) that paints anything, and compositing through any translucent
 * layers behind it. Returns null when that nearest painted layer is an image or gradient (its
 * pixels are not one colour) or when nothing opaque is ever found — the caller must skip
 * rather than guess a background contrast cannot be checked against.
 *
 * @param {Element | null} el @returns {{r:number,g:number,b:number} | null}
 */
function resolveBackgroundColor(el) {
  if (el === null) return null;
  const style = getComputedStyle(el);
  const hasImage = style.backgroundImage !== "none";
  const bg = parseColor(style.backgroundColor);
  const hasColor = bg !== null && bg.a > 0;
  if (!hasImage && !hasColor) return resolveBackgroundColor(el.parentElement);
  if (hasImage) return null;
  if (bg.a >= 0.999) return { r: bg.r, g: bg.g, b: bg.b };
  const behind = resolveBackgroundColor(el.parentElement);
  if (behind === null) return null;
  return compositeOver(bg, behind);
}

/** @param {number} channel 0-255 @returns {number} */
function linearChannel(channel) {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** @param {{r:number,g:number,b:number}} color @returns {number} */
function relativeLuminance(color) {
  return (
    0.2126 * linearChannel(color.r) +
    0.7152 * linearChannel(color.g) +
    0.0722 * linearChannel(color.b)
  );
}

/** @param {{r:number,g:number,b:number}} a @param {{r:number,g:number,b:number}} b @returns {number} */
function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG's "large text": 24px regular weight, or 18.66px (14pt) at bold (700) or heavier. Large
 * text needs less contrast to read, because its strokes are already thick enough to survive it.
 *
 * @param {number} fontSizePx @param {number} fontWeight @returns {boolean}
 */
function isLargeText(fontSizePx, fontWeight) {
  if (fontSizePx >= 24) return true;
  return fontWeight >= 700 && fontSizePx >= 18.66;
}

/**
 * WCAG contrast for one element: 4.5:1 for body text, 3:1 for large text, against the colour
 * actually painted behind it. The design already reasons about this — Doodle Bluff's marker
 * inks were darkened until they cleared 3:1 on paper — but nothing before this enforced it, so
 * a future ink or theme could quietly slip under the floor with nothing to catch it.
 *
 * Returns null for an element the rule does not apply to (no text of its own, or a colour
 * format it cannot parse); otherwise an object saying whether the background could be resolved
 * at all, and the violation, if any, once it could.
 *
 * @param {HTMLElement} el @returns {{ skipped: boolean, violation: Violation | null } | null}
 */
function evaluateContrast(el) {
  if (directText(el) === "") return null;
  const style = getComputedStyle(el);
  const fg = parseColor(style.color);
  if (fg === null) return null;
  const bg = resolveBackgroundColor(el);
  if (bg === null) return { skipped: true, violation: null };
  const size = Number.parseFloat(style.fontSize);
  const weight = Number.parseFloat(style.fontWeight) || 400;
  const large = isLargeText(size, weight);
  const threshold = large ? 3 : 4.5;
  const fgColor = fg.a >= 0.999 ? fg : compositeOver(fg, bg);
  const ratio = contrastRatio(fgColor, bg);
  if (ratio + 0.005 >= threshold) return { skipped: false, violation: null };
  return {
    skipped: false,
    violation: violation(
      "low-contrast",
      el,
      `${ratio.toFixed(2)}:1, floor is ${threshold}:1 for ${large ? "large" : "body"} text`,
    ),
  };
}

/**
 * Contrast can only be judged where the background resolves to one opaque colour; elsewhere
 * this skips rather than guesses. `skipped` is returned alongside `checked` so a caller can
 * assert skipping is not the whole page — a rule that silently skips everything is not a rule.
 *
 * @returns {{ violations: Violation[], checked: number, skipped: number }}
 */
function collectContrastViolations() {
  const elements = Array.from(document.body.querySelectorAll("*")).filter(visible);
  const violations = [];
  let checked = 0;
  let skipped = 0;
  for (const el of elements) {
    const result = evaluateContrast(el);
    if (result === null) continue;
    if (result.skipped) {
      skipped += 1;
      continue;
    }
    checked += 1;
    if (result.violation) violations.push(result.violation);
  }
  return { violations, checked, skipped };
}

window.opgA11y = { collectNameViolations, collectContrastViolations };
