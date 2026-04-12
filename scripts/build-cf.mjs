#!/usr/bin/env node
/**
 * build-cf.mjs
 *
 * Lee las `vars` de wrangler.jsonc e inyecta como env vars
 * antes de correr astro build, para que Vite las incruste en el bundle.
 */

import { readFileSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const WRANGLER_PATH = resolve(ROOT, "wrangler.jsonc");

const raw = readFileSync(WRANGLER_PATH, "utf8");
const stripped = raw
  .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*/g, (_, str) => str ?? "")
  .replace(/,(\s*[}\]])/g, "$1");
const config = JSON.parse(stripped);

const vars = config?.vars ?? {};
if (Object.keys(vars).length === 0) {
  console.warn("[build-cf] No vars found in wrangler.jsonc");
}

console.log("[build-cf] Injecting vars from wrangler.jsonc:");
for (const [k, v] of Object.entries(vars)) {
  console.log(`  ${k}=${v}`);
}

execSync("astro build", {
  stdio: "inherit",
  cwd: ROOT,
  env: { ...process.env, ...vars },
});
