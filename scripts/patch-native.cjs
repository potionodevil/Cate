#!/usr/bin/env node
/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
/**
 * node-pty-prebuilt-multiarch's binding.gyp hardcodes two things we don't
 * need on modern Windows:
 *  1. msvs 'SpectreMitigation': 'Spectre' - requires an extra VS Installer
 *     component (VC.Runtimes.x86.x64.Spectre) that needs elevated UAC to add.
 *  2. The legacy 'pty' (winpty) target - whose deps/winpty/* source isn't
 *     even included in the published npm tarball, so it can never build.
 *
 * windowsPtyAgent.js only loads pty.node (winpty) on Windows builds older
 * than 18309 (pre-1903). Everything we target uses ConPTY, which only needs
 * the 'conpty' and 'conpty_console_list' targets. So: drop the Spectre
 * requirement and drop the unbuildable winpty target entirely.
 *
 * This file is NOT in node_modules and must be re-run after every
 * `npm install` that touches this package (see package.json's
 * "rebuild-native" script, which always runs this first).
 */
const fs = require("fs");
const path = require("path");

const pkgDir = path.join(__dirname, "..", "node_modules", "@homebridge", "node-pty-prebuilt-multiarch");
const gypPath = path.join(pkgDir, "binding.gyp");

if (!fs.existsSync(gypPath)) {
  console.log("[patch-native] binding.gyp not found, skipping (package not installed?)");
  process.exit(0);
}

let src = fs.readFileSync(gypPath, "utf-8");
const original = src;

// 1) Remove the Spectre mitigation requirement.
src = src.replace(
  /'msvs_configuration_attributes':\s*{\s*'SpectreMitigation':\s*'Spectre'\s*},?\s*/,
  ""
);

// 2) Remove the 'pty' (winpty) target block entirely - it's the 3rd target
// in the win targets array, identified by target_name 'pty' with a
// dependency on deps/winpty/src/winpty.gyp. Match the whole object.
src = src.replace(
  /\{\s*'target_name':\s*'pty',[\s\S]*?dependencies'\s*:\s*\[\s*'deps\/winpty\/src\/winpty\.gyp:winpty-agent',\s*'deps\/winpty\/src\/winpty\.gyp:winpty',\s*\],[\s\S]*?\n\s*\}\s*\n(\s*\])/,
  "$1"
);

if (src === original) {
  console.log("[patch-native] binding.gyp already patched or pattern not found (no-op)");
} else {
  fs.writeFileSync(gypPath, src, "utf-8");
  console.log("[patch-native] binding.gyp patched: Spectre requirement + winpty target removed");
}

// 3) The published npm tarball ships NO C++ sources at all (prebuild-only
// package) - fetch the files we actually need straight from the GitHub tag
// matching our installed version, so a from-source Electron-ABI build is
// possible at all. Windows builds need conpty + its path_util helper +
// conpty_console_list; POSIX builds need unix/pty.cc. We fetch every missing
// file regardless of platform, so the same tree can be rebuilt anywhere.
const { execFileSync } = require("child_process");
const pkgVersion = require(path.join(pkgDir, "package.json")).version;
const srcRoot = path.join(pkgDir, "src");
const neededFiles = [
  "win/conpty.cc", "win/conpty.h", "win/conpty_console_list.cc", "win/path_util.cc", "win/path_util.h",
  "unix/pty.cc"
];
const missing = neededFiles.filter((f) => !fs.existsSync(path.join(srcRoot, f)));

if (missing.length > 0) {
  const base = `https://raw.githubusercontent.com/homebridge/node-pty-prebuilt-multiarch/v${pkgVersion}/src`;
  for (const f of missing) {
    const dest = path.join(srcRoot, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    console.log(`[patch-native] fetching missing source ${f} from GitHub (v${pkgVersion})...`);
    execFileSync("curl", ["-sfL", `${base}/${f}`, "-o", dest], { stdio: "inherit" });
  }
  console.log("[patch-native] native sources restored from GitHub");
} else {
  console.log("[patch-native] native sources already present, skipping download");
}
