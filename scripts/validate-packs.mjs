#!/usr/bin/env node
// Validate every content pack. Exits 1 with a readable list of errors.

import { fileURLToPath } from "node:url";
import { loadPacks, validatePack } from "./pack-rules.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const entries = loadPacks(rootDir);

const errors = [];
let itemCount = 0;

for (const entry of entries) {
  const packErrors = validatePack(entry.pack, entry);
  for (const message of packErrors) {
    errors.push(`packs/${entry.folder}/${entry.filename}: ${message}`);
  }
  if (packErrors.length === 0 && Array.isArray(entry.pack?.items)) {
    itemCount += entry.pack.items.length;
  }
}

if (errors.length > 0) {
  console.error(
    `✗ ${errors.length} pack error${errors.length === 1 ? "" : "s"}:`,
  );
  for (const message of errors) console.error(`  ${message}`);
  process.exit(1);
}

console.log(`✓ ${entries.length} packs, ${itemCount} items`);
