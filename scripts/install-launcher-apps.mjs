#!/usr/bin/env node
/**
 * Install macOS launcher apps for TurnSpeak.
 * Creates ~/Applications/Speak Last Claude Turn.app and ~/Applications/Stop Claude TurnSpeak.app
 * These are minimal LSUIElement app bundles for Spotlight/Raycast/Alfred/hotkey launching.
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const APPLICATIONS_DIR = join(homedir(), "Applications");
const SPEAK_APP_DIR = join(APPLICATIONS_DIR, "Speak Last Claude Turn.app");
const STOP_APP_DIR = join(APPLICATIONS_DIR, "Stop Claude TurnSpeak.app");

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function createSpeakApp() {
  const contentsDir = join(SPEAK_APP_DIR, "Contents");
  const macosDir = join(contentsDir, "MacOS");
  const resourcesDir = join(contentsDir, "Resources");

  ensureDir(macosDir);
  ensureDir(resourcesDir);

  // Info.plist
  const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>speak-last</string>
    <key>CFBundleIdentifier</key>
    <string>com.haiggoh.turn-speak.speak-last</string>
    <key>CFBundleName</key>
    <string>Speak Last Claude Turn</string>
    <key>CFBundleDisplayName</key>
    <string>Speak Last Claude Turn</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSignature</key>
    <string>????</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>`;

  writeFileSync(join(contentsDir, "Info.plist"), infoPlist);

  // Executable wrapper (thin shell script that calls ~/bin/speak-last)
  const executable = `#!/usr/bin/env bash
# Speak Last Claude Turn — Launcher app executable
# Delegates to ~/bin/speak-last which finds the TurnSpeak plugin

exec "$HOME/bin/speak-last" "$@"
`;

  const execPath = join(macosDir, "speak-last");
  writeFileSync(execPath, executable);
  chmodSync(execPath, 0o755);

  console.log(`Created ${SPEAK_APP_DIR}`);
}

function createStopApp() {
  const contentsDir = join(STOP_APP_DIR, "Contents");
  const macosDir = join(contentsDir, "MacOS");
  const resourcesDir = join(contentsDir, "Resources");

  ensureDir(macosDir);
  ensureDir(resourcesDir);

  // Info.plist
  const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>stop-turnspeak</string>
    <key>CFBundleIdentifier</key>
    <string>com.haiggoh.turn-speak.stop</string>
    <key>CFBundleName</key>
    <string>Stop Claude TurnSpeak</string>
    <key>CFBundleDisplayName</key>
    <string>Stop Claude TurnSpeak</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSignature</key>
    <string>????</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>`;

  writeFileSync(join(contentsDir, "Info.plist"), infoPlist);

  // Executable wrapper
  const executable = `#!/usr/bin/env bash
# Stop Claude TurnSpeak — Launcher app executable
# Delegates to ~/bin/turn-speak stop

exec "$HOME/bin/turn-speak" stop "$@"
`;

  const execPath = join(macosDir, "stop-turnspeak");
  writeFileSync(execPath, executable);
  chmodSync(execPath, 0o755);

  console.log(`Created ${STOP_APP_DIR}`);
}

function codeSignApps() {
  const apps = [SPEAK_APP_DIR, STOP_APP_DIR];

  for (const app of apps) {
    const result = spawnSync("codesign", ["--force", "--deep", "--sign", "-", app], {
      encoding: "utf8"
    });

    if (result.status === 0) {
      console.log(`Code signed: ${app}`);
    } else {
      console.warn(`Code sign warning for ${app}: ${result.stderr || result.stdout}`);
    }
  }
}

async function verifyApps() {
  const apps = [
    { name: "Speak Last", path: SPEAK_APP_DIR, exec: "speak-last" },
    { name: "Stop", path: STOP_APP_DIR, exec: "stop-turnspeak" }
  ];

  for (const app of apps) {
    const infoPlist = join(app.path, "Contents", "Info.plist");
    const executable = join(app.path, "Contents", "MacOS", app.exec);

    const checks = [
      { name: "Info.plist", path: infoPlist },
      { name: "Executable", path: executable }
    ];

    for (const check of checks) {
      if (existsSync(check.path)) {
        console.log(`  ✓ ${app.name}: ${check.name} exists`);
      } else {
        console.error(`  ✗ ${app.name}: ${check.name} MISSING at ${check.path}`);
      }
    }

    // Verify LSUIElement
    const { readFileSync } = await import("node:fs");
    const plistContent = readFileSync(infoPlist, "utf8");
    if (plistContent.includes("LSUIElement") && plistContent.includes("<true/>")) {
      console.log(`  ✓ ${app.name}: LSUIElement = true (no Dock icon)`);
    } else {
      console.warn(`  ⚠ ${app.name}: LSUIElement not set`);
    }
  }
}

async function main() {
  console.log("Installing TurnSpeak launcher apps...\n");

  ensureDir(APPLICATIONS_DIR);

  createSpeakApp();
  createStopApp();

  console.log("\nCode signing (ad-hoc)...");
  codeSignApps();

  console.log("\nVerifying apps...");
  await verifyApps();

  console.log("\n✅ Launcher apps installed!");
  console.log("   ~/Applications/Speak Last Claude Turn.app");
  console.log("   ~/Applications/Stop Claude TurnSpeak.app");
  console.log("\nThese will appear in Spotlight, Raycast, Alfred, and can be bound to hotkeys.");
  console.log("Note: ~/bin must be in your PATH for the apps to work.");
}

main().catch((error) => {
  console.error(`Install failed: ${error.message}`);
  process.exit(1);
});