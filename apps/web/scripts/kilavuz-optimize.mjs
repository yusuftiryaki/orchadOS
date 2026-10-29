#!/usr/bin/env node
// Shrinks the guide screenshots (docs/kilavuz/img) with pngquant when it is
// installed, and prints the folder size. Lossy palette quantisation; the
// screens stay readable at 256 colours.
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../docs/kilavuz/img");
const pngs = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".png")) pngs.push(p);
  }
})(root);

let quant = true;
try {
  execFileSync("pngquant", ["--version"], { stdio: "ignore" });
} catch {
  quant = false;
  console.warn("pngquant not found; images are left as they are");
}
if (quant) {
  for (const p of pngs) {
    try {
      execFileSync("pngquant", [
        "--force",
        "--skip-if-larger",
        "--quality=70-95",
        "--ext",
        ".png",
        p,
      ]);
    } catch (error) {
      // 98/99: the result would be larger or worse than the quality floor.
      if (![98, 99].includes(error.status)) throw error;
    }
  }
}
const bytes = pngs.reduce((sum, p) => sum + statSync(p).size, 0);
console.log(`${pngs.length} images, ${(bytes / 1024 / 1024).toFixed(1)} MB in ${root}`);
