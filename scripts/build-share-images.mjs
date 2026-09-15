#!/usr/bin/env node
// Renders the favicon, app icons and the social share card into apps/web/public.
//
//   node scripts/build-share-images.mjs
//
// apps/web/public/icon.svg is the source for every icon; the share card layout
// lives in shareCardHtml below. Needs Playwright's Chromium
// (`pnpm exec playwright install chromium`). Commit the files it writes.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const publicDir = path.join(rootDir, "apps", "web", "public");
const fontsDir = path.join(rootDir, "packages", "ui", "node_modules", "@fontsource");
const iconSvg = fs.readFileSync(path.join(publicDir, "icon.svg"), "utf8");

const INK = "#2B2B2B";
const PAPER = "#FBF8F1";
const GRID = "#E4ECF6";
const HIGHLIGHT = "#FFE45C";

// Doodle avatars from packages/ui/src/avatar-art.tsx (viewBox 0 0 100 100, 4px outline).
const AVATARS = {
  star: `<path d="M50 8l12 26 28 3-21 19 6 28-25-14-25 14 6-28-21-19 28-3z" fill="#FFE45C" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><circle cx="43" cy="50" r="4" fill="${INK}"/><circle cx="57" cy="50" r="4" fill="${INK}"/><path d="M44 59q6 9 12 0z" fill="${INK}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`,
  drop: `<path d="M50 6c6 10 34 30 34 56 0 18-15 30-34 30S16 80 16 62C16 36 44 16 50 6z" fill="#93E3C9" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><circle cx="50" cy="58" r="13" fill="#FFFFFF" stroke="${INK}" stroke-width="4"/><circle cx="53" cy="59" r="5.5" fill="${INK}"/><path d="M42 81q8 5 16 0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`,
  cloud: `<path d="M28 84c-12 0-20-8-20-19 0-10 7-17 16-18 1-15 12-27 27-27 12 0 22 8 25 19 10 1 18 9 18 20 0 14-9 25-22 25z" fill="#A3CCFF" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M35 60q6 5 12 0M57 60q6 5 12 0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`,
  cat: `<path d="M20 36L18 10l20 14c4-1 8-2 12-2s8 1 12 2l20-14-2 26c6 7 10 16 10 26 0 20-18 30-40 30S10 82 10 62c0-10 4-19 10-26z" fill="#CDB8FF" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><circle cx="38" cy="58" r="4.5" fill="${INK}"/><circle cx="62" cy="58" r="4.5" fill="${INK}"/><path d="M44 70l6 5 6-5" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  ghost: `<path d="M50 10c19 0 32 15 32 34v46l-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6V44c0-19 13-34 32-34z" fill="#F5C2E7" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><circle cx="41" cy="44" r="5" fill="${INK}"/><circle cx="59" cy="44" r="5" fill="${INK}"/><circle cx="50" cy="60" r="4" fill="${INK}"/>`,
};

/** A self-contained @font-face rule for one @fontsource woff2 file. */
function fontFace(family, weight, file) {
  const data = fs.readFileSync(path.join(fontsDir, file)).toString("base64");
  return `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/woff2;base64,${data}) format("woff2");}`;
}

/** The notebook paper grid used on the TV and phone surfaces. */
function paperGrid(cell, line) {
  return `background-color:${PAPER};background-image:linear-gradient(${GRID} ${line}px,transparent ${line}px),linear-gradient(90deg,${GRID} ${line}px,transparent ${line}px);background-size:${cell}px ${cell}px;`;
}

/** One doodle avatar as an absolutely placed inline SVG. */
function avatar({ id, size, left, top, rotate }) {
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" style="position:absolute;left:${left}px;top:${top}px;transform:rotate(${rotate}deg)">${AVATARS[id]}</svg>`;
}

/** The 1200x630 Open Graph card, styled like the TV landing screen. */
function shareCardHtml() {
  const fonts = [
    fontFace("Permanent Marker", 400, "permanent-marker/files/permanent-marker-latin-400-normal.woff2"),
    fontFace("Atkinson Hyperlegible", 400, "atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2"),
    fontFace("Atkinson Hyperlegible", 700, "atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2"),
  ].join("");
  return `<!doctype html><html><head><style>${fonts}
    html,body{margin:0}
    .card{box-sizing:border-box;width:1200px;height:630px;padding:48px 64px 52px;display:flex;flex-direction:column;justify-content:space-between;${paperGrid(40, 2)}font-family:"Atkinson Hyperlegible",sans-serif;color:${INK}}
    .marker{font-family:"Permanent Marker",cursive;font-weight:400}
    .highlight{position:relative;display:inline-block;padding:0 12px}
    .highlight::before{content:"";position:absolute;left:0;right:0;top:46%;height:46%;background:${HIGHLIGHT};border-radius:8px;transform:rotate(-1.5deg)}
    .highlight>span{position:relative}
    .body{display:flex;align-items:center;justify-content:space-between}
    h1{margin:0;font-size:64px;line-height:1.12}
    p{margin:24px 0 0;max-width:600px;font-size:32px;line-height:1.35}
    .note{position:relative;width:330px;height:300px;margin-right:8px;background:#FFFFFF;border:4px solid ${INK};border-radius:40px 12px 36px 14px/14px 36px 12px 40px;transform:rotate(2.5deg)}
    .tape{position:absolute;left:90px;top:-20px;width:150px;height:40px;background:rgba(255,228,92,.8);transform:rotate(-3deg)}
    .players{position:absolute;left:0;right:0;bottom:24px;text-align:center;font-size:28px;font-weight:700}
    .url{font-size:30px;font-weight:700}
  </style></head><body><div class="card">
    <div class="marker highlight" style="align-self:flex-start;font-size:40px"><span>OpenPartyGames</span></div>
    <div class="body">
      <div>
        <h1 class="marker">Party games for<br><span class="highlight"><span>your TV and phones</span></span></h1>
        <p>Free, open source, no app. One screen hosts, everyone plays on their phone.</p>
      </div>
      <div class="note"><div class="tape"></div>
        ${avatar({ id: "drop", size: 88, left: 22, top: 34, rotate: -8 })}
        ${avatar({ id: "cloud", size: 92, left: 218, top: 26, rotate: 6 })}
        ${avatar({ id: "star", size: 140, left: 95, top: 70, rotate: 8 })}
        ${avatar({ id: "ghost", size: 84, left: 26, top: 150, rotate: 5 })}
        ${avatar({ id: "cat", size: 86, left: 222, top: 146, rotate: -6 })}
        <div class="players">3–8 players</div>
      </div>
    </div>
    <div class="url">openpartygames.org</div>
  </div></body></html>`;
}

/** The icon centered on a square, over the paper grid or a transparent background. */
function iconHtml(size, scale, paper) {
  const background = paper
    ? paperGrid(Math.round(size / 6), Math.max(2, Math.round(size / 90)))
    : "background:transparent;";
  const inner = Math.round(size * scale);
  return `<!doctype html><html><head><style>
    html,body{margin:0;width:${size}px;height:${size}px;${background}}
    body{display:grid;place-items:center}
    svg{display:block;width:${inner}px;height:${inner}px}
  </style></head><body>${iconSvg}</body></html>`;
}

/** Screenshots `html` in its own page at exactly size.width x size.height CSS pixels. */
async function renderPng(browser, html, size) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({ type: "png", omitBackground: true, clip: { x: 0, y: 0, ...size } });
  } finally {
    await page.close();
  }
}

/** Renders the icon square at `px` pixels; see iconHtml for scale and paper. */
function renderIcon(browser, px, scale, paper) {
  return renderPng(browser, iconHtml(px, scale, paper), { width: px, height: px });
}

/** Packs PNG images into one .ico file (PNG-compressed entries, supported by every current browser). */
function icoFromPngs(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0);
    entry.writeUInt8(size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

/** Writes one file into apps/web/public and logs it. */
function write(name, data) {
  fs.writeFileSync(path.join(publicDir, name), data);
  console.log(`Wrote apps/web/public/${name} (${Math.round(data.length / 1024)} KiB)`);
}

const browser = await chromium.launch();
try {
  const icoSizes = [16, 32, 48];
  const [icoPngs, appleTouch, icon192, icon512, maskable, shareCard] = await Promise.all([
    Promise.all(icoSizes.map((px) => renderIcon(browser, px, 1, false))),
    renderIcon(browser, 180, 0.74, true),
    renderIcon(browser, 192, 1, false),
    renderIcon(browser, 512, 1, false),
    // Maskable icons get cropped to a circle as small as 80% of the square; keep the star inside it.
    renderIcon(browser, 512, 0.62, true),
    renderPng(browser, shareCardHtml(), { width: 1200, height: 630 }),
  ]);
  write("favicon.ico", icoFromPngs(icoSizes.map((size, i) => ({ size, png: icoPngs[i] }))));
  write("apple-touch-icon.png", appleTouch);
  write("icon-192.png", icon192);
  write("icon-512.png", icon512);
  write("icon-maskable-512.png", maskable);
  write("og-image.png", shareCard);
} finally {
  await browser.close();
}
