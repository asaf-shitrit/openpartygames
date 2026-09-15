// Removes coverage output everywhere so the CRAP report never reads stale data.
import { rmSync } from "node:fs";
import { globSync } from "node:fs";

const dirs = ["coverage", ...globSync("{apps,packages,games}/*/coverage")];
for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
console.log(`cleaned ${dirs.length} coverage directories`);
