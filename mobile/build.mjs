#!/usr/bin/env node
/**
 * Builds the storefront into mobile/www with the API origin baked in
 * (VITE_API_BASE), then optionally runs `cap sync` to push it into the
 * native Android/iOS projects.
 *
 *   node build.mjs            build the web bundle only
 *   node build.mjs --sync     build + cap sync
 *
 * The API origin defaults to this machine's LAN address so a phone on the same
 * Wi-Fi can reach it; override it for an emulator or a public host:
 *
 *   VITE_API_BASE=http://10.0.2.2:4000 npm run build     # Android emulator
 *   VITE_API_BASE=https://demo.example.com npm run build # deployed API
 */
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = process.env.PORT || "4000";

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return "127.0.0.1";
}

const apiBase = (process.env.VITE_API_BASE || `http://${lanAddress()}:${PORT}`).replace(
  /\/+$/,
  "",
);

// the API has to be running on the target device's network
try {
  const res = await fetch(`${apiBase}/api/site`, { signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  console.log(`API reachable at ${apiBase}`);
} catch {
  console.warn(
    `warning: no answer from ${apiBase} - start it with "npm run server" in the project root`,
  );
}

console.log(`building storefront -> mobile/www  (VITE_API_BASE=${apiBase})`);
const build = spawnSync("npx vite build --mode mobile --outDir mobile/www --emptyOutDir", {
  cwd: ROOT,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, VITE_API_BASE: apiBase },
});
if (build.status !== 0) process.exit(build.status ?? 1);

if (process.argv.includes("--sync")) {
  const sync = spawnSync("npx cap sync", { cwd: HERE, stdio: "inherit", shell: true });
  process.exit(sync.status ?? 0);
}

console.log('done - run "npm run sync" to copy it into the native projects');
