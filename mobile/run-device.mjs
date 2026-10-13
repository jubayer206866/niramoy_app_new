#!/usr/bin/env node
/**
 * Build, install and launch the debug build on a connected Android device.
 *
 *   npm run android:run
 *
 * Steps: build the storefront into www/ -> cap sync -> gradle assembleDebug ->
 * adb install -> adb reverse (USB fallback for the API) -> launch the app.
 *
 * Requires: ANDROID_HOME (or adb on PATH), USB debugging enabled on the phone.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ANDROID = path.join(HERE, "android");
const PORT = process.env.PORT || "4000";
const PKG = "com.niramoy.pharmacy";
const APK = path.join(ANDROID, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const WIN = process.platform === "win32";

const ADB =
  process.env.ADB ||
  (process.env.ANDROID_HOME
    ? path.join(process.env.ANDROID_HOME, "platform-tools", WIN ? "adb.exe" : "adb")
    : WIN
      ? "adb.exe"
      : "adb");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (res.error) {
    console.error(`could not run ${cmd}: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0 && !opts.allowFail) {
    console.error(`\nfailed: ${cmd} ${args.join(" ")}`);
    process.exit(res.status ?? 1);
  }
  return res;
}

function capture(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: "utf8" });
  return `${res.stdout || ""}${res.stderr || ""}`;
}

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function listDevices() {
  return capture(ADB, ["devices"])
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("*"))
    .map((l) => {
      const [serial, state] = l.split(/\s+/);
      return { serial, state };
    });
}

// ---------------------------------------------------------------- device
const WAIT = process.argv.includes("--wait");
run(ADB, ["start-server"], { allowFail: true });

let ready = listDevices().filter((d) => d.state === "device");

if (!ready.length && !WAIT) {
  const others = listDevices();
  if (others.length) {
    console.error(`device connected but not usable: ${JSON.stringify(others)}`);
    console.error("accept the USB debugging prompt on the phone, or reconnect the cable");
  } else {
    console.error("no Android device found - enable USB debugging and plug the phone in");
    console.error('(use "npm run android:watch" to wait for it instead)');
  }
  process.exit(1);
}

if (!ready.length) {
  console.log("waiting for the phone - unlock it, keep USB debugging + 'Install via USB' on");
  const deadline = Date.now() + 30 * 60_000;
  let lastHint = 0;
  while (!ready.length && Date.now() < deadline) {
    const now = Date.now();
    if (now - lastHint >= 15_000) {
      const state = listDevices()[0];
      const detail = state ? `seen as "${state.state}"` : "not seen at all";
      console.log(
        `  ${new Date().toTimeString().slice(0, 8)} still waiting (${detail}) - replug the cable / re-approve USB debugging`,
      );
      lastHint = now;
    }
    sleepSync(2000);
    ready = listDevices().filter((d) => d.state === "device");
  }
  if (!ready.length) {
    console.error("gave up after 30 minutes");
    process.exit(1);
  }
}

const serial = process.env.ANDROID_SERIAL || (ready.length === 1 ? ready[0].serial : null);
if (!serial) {
  console.error(`several devices connected, pick one with ANDROID_SERIAL: ${ready.map((d) => d.serial).join(", ")}`);
  process.exit(1);
}
console.log(`device: ${serial}`);

// ------------------------------------------------------- web assets + sync
if (!process.argv.includes("--skip-build")) {
  run(process.execPath, [path.join(HERE, "build.mjs"), "--sync"], { cwd: HERE });
} else {
  run("npx", ["cap", "sync"], { cwd: HERE, shell: true });
}

// ---------------------------------------------------------------- apk
console.log("\nassembling debug APK...");
if (WIN) {
  run("cmd", ["/c", path.join(ANDROID, "gradlew.bat"), "assembleDebug"], { cwd: ANDROID });
} else {
  run(path.join(ANDROID, "gradlew"), ["assembleDebug"], { cwd: ANDROID });
}
if (!fs.existsSync(APK)) {
  console.error(`expected APK at ${APK}`);
  process.exit(1);
}

// ------------------------------------------------------- install + launch
const attempts = WAIT ? 10 : 3;
let installed = false;
for (let a = 1; a <= attempts && !installed; a++) {
  const out = capture(ADB, ["-s", serial, "install", "-r", APK]).trim();
  console.log(`install ${a}/${attempts}: ${out.replace(/\s+/g, " ")}`);
  if (/success/i.test(out)) {
    installed = true;
    break;
  }
  if (/USER_RESTRICTED/i.test(out)) {
    console.log("  >> on the phone: Developer options -> 'Install via USB' ON, screen unlocked");
  }
  if (a < attempts) sleepSync(10_000);
}
if (!installed) {
  console.error("install failed");
  process.exit(1);
}

// makes http://127.0.0.1:PORT work on the phone while it is plugged in
run(ADB, ["-s", serial, "reverse", `tcp:${PORT}`, `tcp:${PORT}`], { allowFail: true });
run(ADB, ["-s", serial, "shell", "am", "start", "-n", `${PKG}/.MainActivity`]);

console.log(`
app installed and launched.

  API        ${process.env.VITE_API_BASE || "(auto: this machine's LAN address)"}
  USB link   adb reverse tcp:${PORT} tcp:${PORT} is active, so the phone can also
             reach the API on 127.0.0.1:${PORT} while it is plugged in
  logs       adb -s ${serial} logcat | grep -i ${PKG.split(".").pop()}
  reinstall  npm run android:run          (this script)
`);
