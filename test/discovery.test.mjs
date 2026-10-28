import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

// Every CLI spawned here runs in an EMPTY home: the real ~/.claude transcripts, playback
// state and plugin cache must never reach a test (they made these tests read and PLAY the
// operator's latest reply aloud). DRY_RUN is the second wall: nothing can reach the speaker.
const REPO = join(import.meta.dirname, "..");
const SANDBOX = mkdtempSync(join(tmpdir(), "turn-speak-test-home-"));
const SANDBOX_ENV = {
  ...process.env,
  HOME: SANDBOX,
  CLAUDE_CONFIG_DIR: join(SANDBOX, ".claude"),
  CODEX_HOME: join(SANDBOX, ".codex"),
  CODEX_READ_ALOUD_DRY_RUN: "1"
};

test("discovery script finds development checkout scripts", () => {
  const result = spawnSync("node", [
    join(REPO, "scripts/lib/discovery.mjs")
  ], {
    encoding: "utf8",
    env: SANDBOX_ENV,
    cwd: REPO
  });

  assert.equal(result.status, 0);
  const output = result.stdout.trim();
  assert.match(output, /scripts$/);
  // HOME is sandboxed, so no installed copy exists: discovery must find THIS checkout.
  assert.equal(output, join(REPO, "scripts"));
});

test("discovery script output is valid directory with speak-latest-claude.mjs", () => {
  const result = spawnSync("node", [
    join(REPO, "scripts/lib/discovery.mjs")
  ], {
    encoding: "utf8",
    env: SANDBOX_ENV
  });

  const scriptsDir = result.stdout.trim();
  const targetFile = join(scriptsDir, "speak-latest-claude.mjs");

  // Use a separate spawn to check file exists
  const check = spawnSync("test", ["-f", targetFile]);
  assert.equal(check.status, 0, `Expected ${targetFile} to exist`);
});

test("turn-speak CLI shows help", () => {
  const result = spawnSync("node", [
    join(REPO, "scripts/turn-speak.mjs"),
    "--help"
  ], {
    encoding: "utf8",
    env: SANDBOX_ENV
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /turn-speak v/);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /latest/);
  assert.match(result.stdout, /stop/);
});

test("turn-speak CLI shows version", () => {
  const result = spawnSync("node", [
    join(REPO, "scripts/turn-speak.mjs"),
    "--version"
  ], {
    encoding: "utf8",
    env: SANDBOX_ENV
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /turn-speak v/);
});

test("turn-speak latest --diagnose works without transcripts", () => {
  const result = spawnSync("node", [
    join(REPO, "scripts/turn-speak.mjs"),
    "latest",
    "--diagnose"
  ], {
    encoding: "utf8",
    env: SANDBOX_ENV
  });

  // Should not crash, should output diagnostic message
  assert.equal(result.status, 0);
  assert.match(result.stdout, /No completed main-agent response found/);
});

test("turn-speak stop works without active playback", () => {
  const result = spawnSync("node", [
    join(REPO, "scripts/turn-speak.mjs"),
    "stop"
  ], {
    encoding: "utf8",
    env: SANDBOX_ENV
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /No active playback to stop/);
});

test("turn-speak rejects unknown provider", () => {
  const result = spawnSync("node", [
    join(REPO, "scripts/turn-speak.mjs"),
    "latest",
    "--provider",
    "invalid-provider"
  ], {
    encoding: "utf8",
    env: SANDBOX_ENV
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /not yet implemented/);
});