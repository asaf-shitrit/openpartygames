import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const webDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// Template content is inert, so parsing index.html here never fetches its stylesheet or script.
const template = document.createElement("template");
template.innerHTML = readFileSync(path.join(webDir, "index.html"), "utf8");
const head = template.content;

const manifestSchema = z.object({
  icons: z.array(z.object({ src: z.string(), sizes: z.string() })),
});

/** The public/ file behind a site path such as "/icon.svg". */
function publicFile(sitePath: string): string {
  return path.join(webDir, "public", sitePath);
}

/** Width and height from a PNG's IHDR chunk, as "WxH". */
function pngSize(file: string): string {
  const bytes = readFileSync(file);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

function metaContent(property: string): string {
  return head.querySelector(`meta[property="${property}"]`)?.getAttribute("content") ?? "";
}

describe("share and icon metadata in index.html", () => {
  it("points every icon and manifest link at a file in public/", () => {
    const hrefs = [
      ...head.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]'),
    ].map((link) => link.getAttribute("href") ?? "");

    expect(hrefs).toHaveLength(4);
    expect(hrefs.filter((href) => !existsSync(publicFile(href)))).toEqual([]);
  });

  it("serves an Open Graph image with the size it declares", () => {
    const image = metaContent("og:image");
    const siteUrl = metaContent("og:url");
    const declared = `${metaContent("og:image:width")}x${metaContent("og:image:height")}`;

    expect(image.startsWith(siteUrl)).toBe(true);
    expect(declared).toBe("1200x630");
    expect(pngSize(publicFile(image.slice(siteUrl.length)))).toBe(declared);
  });

  it("lists manifest icons that exist at their declared sizes", () => {
    const manifest = manifestSchema.parse(
      JSON.parse(readFileSync(publicFile("manifest.webmanifest"), "utf8")),
    );
    const actual = manifest.icons.map((icon) => `${icon.src} ${pngSize(publicFile(icon.src))}`);

    expect(actual).toContain("/icon-512.png 512x512");
    expect(actual).toEqual(manifest.icons.map((icon) => `${icon.src} ${icon.sizes}`));
  });
});
