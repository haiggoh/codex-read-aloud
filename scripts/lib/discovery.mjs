#!/usr/bin/env node
/**
 * Plugin path discovery for TurnSpeak CLI wrappers.
 * Resolves the installed plugin's scripts directory regardless of version.
 *
 * Search order:
 * 1. ~/.claude/plugins/cache/haiggoh/codex-read-aloud/<version>/scripts/ (newest version)
 * 2. ~/plugins/codex-read-aloud/scripts/ (manual clone)
 * 3. CLAUDE_WORKSPACE/claude-turn-speak/scripts/ (development checkout)
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");

function findPluginScriptsDir() {
  // 1. Check ~/.claude/plugins/cache/haiggoh/codex-read-aloud/*/scripts/ (newest version)
  const cacheBase = join(homedir(), ".claude", "plugins", "cache", "haiggoh", "codex-read-aloud");
  if (existsSync(cacheBase)) {
    const versions = readdirSync(cacheBase, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .filter(v => existsSync(join(cacheBase, v, "scripts", "speak-latest-claude.mjs")))
      .sort((a, b) => {
        // Semver sort: newest first
        const pa = a.split(".").map(Number);
        const pb = b.split(".").map(Number);
        for (let i = 0; i < 3; i++) {
          if (pa[i] !== pb[i]) return pb[i] - pa[i];
        }
        return 0;
      });

    if (versions.length > 0) {
      const scriptsDir = join(cacheBase, versions[0], "scripts");
      if (existsSync(join(scriptsDir, "speak-latest-claude.mjs"))) {
        return scriptsDir;
      }
    }
  }

  // 2. Check manual clone at ~/plugins/codex-read-aloud/scripts/
  const manualClone = join(homedir(), "plugins", "codex-read-aloud", "scripts");
  if (existsSync(join(manualClone, "speak-latest-claude.mjs"))) {
    return manualClone;
  }

  // 3. Check development checkout (this repo)
  const devScripts = join(PROJECT_ROOT, "scripts");
  if (existsSync(join(devScripts, "speak-latest-claude.mjs"))) {
    return devScripts;
  }

  return null;
}

const scriptsDir = findPluginScriptsDir();

if (!scriptsDir) {
  process.stderr.write("TurnSpeak: Could not locate plugin scripts directory.\n");
  process.stderr.write("Checked:\n");
  process.stderr.write(`  ~/.claude/plugins/cache/haiggoh/codex-read-aloud/*/scripts/\n`);
  process.stderr.write(`  ~/plugins/codex-read-aloud/scripts/\n`);
  process.stderr.write(`  ${PROJECT_ROOT}/scripts/\n`);
  process.exit(1);
}

process.stdout.write(scriptsDir + "\n");