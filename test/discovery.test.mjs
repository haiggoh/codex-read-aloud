import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("discovery script finds development checkout scripts", () => {
  const result = spawnSync("node", [
    "/Users/bra0002h/ClaudeWorkspace/claude-turn-speak/scripts/lib/discovery.mjs"
  ], {
    encoding: "utf8",
    cwd: "/Users/bra0002h/ClaudeWorkspace/claude-turn-speak"
  });

  assert.equal(result.status, 0);
  const output = result.stdout.trim();
  assert.match(output, /scripts$/);
  assert.ok(output.includes("claude-turn-speak"));
});

test("discovery script output is valid directory with speak-latest-claude.mjs", () => {
  const result = spawnSync("node", [
    "/Users/bra0002h/ClaudeWorkspace/claude-turn-speak/scripts/lib/discovery.mjs"
  ], {
    encoding: "utf8"
  });

  const scriptsDir = result.stdout.trim();
  const targetFile = join(scriptsDir, "speak-latest-claude.mjs");

  // Use a separate spawn to check file exists
  const check = spawnSync("test", ["-f", targetFile]);
  assert.equal(check.status, 0, `Expected ${targetFile} to exist`);
});

test("turn-speak CLI shows help", () => {
  const result = spawnSync("node", [
    "/Users/bra0002h/ClaudeWorkspace/claude-turn-speak/scripts/turn-speak.mjs",
    "--help"
  ], {
    encoding: "utf8"
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /turn-speak v/);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /latest/);
  assert.match(result.stdout, /stop/);
});

test("turn-speak CLI shows version", () => {
  const result = spawnSync("node", [
    "/Users/bra0002h/ClaudeWorkspace/claude-turn-speak/scripts/turn-speak.mjs",
    "--version"
  ], {
    encoding: "utf8"
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /turn-speak v/);
});

test("turn-speak latest --diagnose works without transcripts", () => {
  const result = spawnSync("node", [
    "/Users/bra0002h/ClaudeWorkspace/claude-turn-speak/scripts/turn-speak.mjs",
    "latest",
    "--diagnose"
  ], {
    encoding: "utf8"
  });

  // Should not crash, should output diagnostic message
  assert.equal(result.status, 0);
  assert.match(result.stdout, /No completed main-agent response found/);
});

test("turn-speak stop works without active playback", () => {
  const result = spawnSync("node", [
    "/Users/bra0002h/ClaudeWorkspace/claude-turn-speak/scripts/turn-speak.mjs",
    "stop"
  ], {
    encoding: "utf8"
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /No active playback to stop/);
});

test("turn-speak rejects unknown provider", () => {
  const result = spawnSync("node", [
    "/Users/bra0002h/ClaudeWorkspace/claude-turn-speak/scripts/turn-speak.mjs",
    "latest",
    "--provider",
    "invalid-provider"
  ], {
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /not yet implemented/);
});