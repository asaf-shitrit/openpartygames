#!/usr/bin/env node
// Renders each page of the design canvas into design/previews/<page>.jpg for the README.
//
//   node scripts/build-design-previews.mjs
//
// design/canvas.json places every design/*.dc.html artboard on a page; this lays each
// page out the same way, with the artboard titles above them. Needs Playwright's
// Chromium (`pnpm exec playwright install chromium`). Rerun after changing a design and
// commit the files it writes.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const designDir = path.join(rootDir, "design");
const outDir = path.join(designDir, "previews");
const fontsDir = path.join(rootDir, "packages", "ui", "node_modules", "@fontsource");
const canvas = JSON.parse(fs.readFileSync(path.join(designDir, "canvas.json"), "utf8"));

// The style directions that weren't picked stay on the canvas but out of the README.
const SKIPPED_PAGES = new Set(["style-options"]);
const SCALE = 0.5;
// Canvas units around the artboards, and above each one for its title.
const PADDING = 120;
const TITLE_SPACE = 90;
// Pages load from a made-up origin so every request can be answered locally.
const ORIGIN = "http://design.local";

/** A self-contained @font-face rule for one @fontsource woff2 file. */
function fontFace(family, weight, file) {
  const data = fs.readFileSync(path.join(fontsDir, file)).toString("base64");
  return `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/woff2;base64,${data}) format("woff2");}`;
}

// Stands in for the Google Fonts stylesheet the artboards link to.
const fontCss = [
  fontFace("Permanent Marker", 400, "permanent-marker/files/permanent-marker-latin-400-normal.woff2"),
  fontFace("Atkinson Hyperlegible", 400, "atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2"),
  fontFace("Atkinson Hyperlegible", 700, "atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2"),
].join("");

/** The smallest box holding every artboard, in canvas units. */
function bounds(artboards) {
  const left = Math.min(...artboards.map((a) => a.x));
  const top = Math.min(...artboards.map((a) => a.y));
  const right = Math.max(...artboards.map((a) => a.x + a.w));
  const bottom = Math.max(...artboards.map((a) => a.y + a.h));
  return { left, top, width: right - left, height: bottom - top };
}

/** Escapes text for an HTML attribute or element. */
function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** One canvas page as an HTML document, plus its size in pixels. */
function pageHtml(artboards) {
  const box = bounds(artboards);
  const stageWidth = box.width + 2 * PADDING;
  const stageHeight = box.height + 2 * PADDING + TITLE_SPACE;
  const boards = artboards
    .map((a) => {
      const left = a.x - box.left + PADDING;
      const top = a.y - box.top + PADDING + TITLE_SPACE;
      return `<div class="board" style="left:${left}px;top:${top}px">
        <div class="title" style="width:${a.w}px">${escapeHtml(a.title)}</div>
        <iframe src="${ORIGIN}/${encodeURIComponent(a.file)}" width="${a.w}" height="${a.h}" title="${escapeHtml(a.title)}"></iframe>
      </div>`;
    })
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}
    html,body{margin:0}
    body{background:#E9E6DF;overflow:hidden}
    .stage{position:relative;width:${stageWidth}px;height:${stageHeight}px;transform:scale(${SCALE});transform-origin:0 0}
    .board{position:absolute}
    .board iframe{display:block;border:0;background:#FBF8F1;box-shadow:0 12px 40px rgba(43,43,43,0.18)}
    .title{position:absolute;left:0;bottom:100%;margin-bottom:22px;font:700 44px/1.1 "Atkinson Hyperlegible",sans-serif;color:#555555}
  </style></head><body><div class="stage">${boards}</div></body></html>`;
  return { html, width: Math.ceil(stageWidth * SCALE), height: Math.ceil(stageHeight * SCALE) };
}

/** Answers every request from disk: the page, the artboards, their fonts. Nothing reaches the network. */
async function serveLocally(page, html) {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "fonts.googleapis.com") {
      return route.fulfill({ contentType: "text/css", body: fontCss });
    }
    if (url.origin !== ORIGIN) return route.abort();
    const name = decodeURIComponent(url.pathname.slice(1));
    if (name === "") return route.fulfill({ contentType: "text/html", body: html });
    // The canvas editor's runtime isn't in the repo; the artboards render without it.
    if (name === "support.js") return route.fulfill({ contentType: "text/javascript", body: "" });
    return route.fulfill({ contentType: "text/html", path: path.join(designDir, path.basename(name)) });
  });
}

/** Renders one canvas page to design/previews/<id>.jpg. */
async function renderPage(browser, canvasPage) {
  const artboards = canvas.artboards.filter((a) => a.page === canvasPage.id);
  const { html, width, height } = pageHtml(artboards);
  const page = await browser.newPage({ viewport: { width, height } });
  await serveLocally(page, html);
  await page.goto(`${ORIGIN}/`);
  await Promise.all(page.frames().map((frame) => frame.evaluate(() => document.fonts.ready)));
  const file = path.join(outDir, `${canvasPage.id}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 85 });
  await page.close();
  console.log(`wrote ${path.relative(rootDir, file)} (${width}x${height})`);
}

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const pages = canvas.pages.filter((p) => !SKIPPED_PAGES.has(p.id));
await Promise.all(pages.map((canvasPage) => renderPage(browser, canvasPage)));
await browser.close();
