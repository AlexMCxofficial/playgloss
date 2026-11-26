// Keep every installer and the npm lockfile on the same release version.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const readText = file => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const readJson = file => JSON.parse(readText(file));

const packageInfo = readJson("package.json");
const lockfile = readJson("package-lock.json");
const tauri = readJson("src-tauri/tauri.conf.json");
const cargo = readText("src-tauri/Cargo.toml");
const cargoLock = readText("src-tauri/Cargo.lock");
const cargoVersion = cargo.match(/^version = "([^"]+)"/m);
const lockedVersion = cargoLock.match(/name = "playgloss"\nversion = "([^"]+)"/);
const version = packageInfo.version;

const found = {
  "package.json": version,
  "package-lock.json": lockfile.version,
  "package-lock.json (packages[\"\"])": lockfile.packages && lockfile.packages[""] && lockfile.packages[""].version,
  "src-tauri/tauri.conf.json": tauri.version,
  "src-tauri/Cargo.toml": cargoVersion && cargoVersion[1],
  "src-tauri/Cargo.lock": lockedVersion && lockedVersion[1]
};

const bad = Object.entries(found).filter(([, v]) => v !== version);
if (bad.length) {
  console.error("Release versions must match in npm, Cargo, and Tauri files.");
  for (const [file, v] of Object.entries(found)) console.error("  " + file + ": " + (v || "NOT FOUND"));
  process.exitCode = 1;
} else {
  console.log("Building PlayGloss " + version);
}
