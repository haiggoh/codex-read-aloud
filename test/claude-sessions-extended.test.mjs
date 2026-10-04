import { mkdtempSync, rmSync, writeFileSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  findLatestClaudeSessionFile,
  getLatestClaudeAssistantMessage,
  findLatestClaudeAssistantMessage,
  diagnoseLatestClaudeSession,
  defaultClaudeProjectsDir
} from "../scripts/lib/claude-sessions.mjs";

test("findLatestClaudeSessionFile with projectName filter", () => {
  const root = mkdtempSync(join(tmpdir(), "claude-projects-filter-"));
  const projectA = join(root, "project-a");
  const projectB = join(root, "project-b");

  mkdirSync(projectA, { recursive: true });
  mkdirSync(projectB, { recursive: true });

  const fileA = join(projectA, "session1.jsonl");
  const fileB = join(projectB, "session2.jsonl");

  writeFileSync(fileA, "{}");
  writeFileSync(fileB, "{}");

  const base = Date.now() / 1000;
  utimesSync(fileA, base - 10, base - 10);
  utimesSync(fileB, base - 5, base - 5); // B is newer

  // Without filter, should get newest (project-b)
  const latest = findLatestClaudeSessionFile(root);
  assert.equal(latest, fileB);

  // With projectName filter for project-a, should get fileA
  const filtered = findLatestClaudeSessionFile(root, { projectName: "project-a" });
  assert.equal(filtered, fileA);

  // Non-existent project returns null
  const missing = findLatestClaudeSessionFile(root, { projectName: "project-c" });
  assert.equal(missing, null);

  rmSync(root, { recursive: true });
});

test("findLatestClaudeSessionFile ignores subagents directory even with project filter", () => {
  const root = mkdtempSync(join(tmpdir(), "claude-subagents-filter-"));
  const projectA = join(root, "project-a");
  const subagents = join(projectA, "subagents");

  mkdirSync(projectA, { recursive: true });
  mkdirSync(subagents, { recursive: true });

  const mainFile = join(projectA, "main.jsonl");
  const subFile = join(subagents, "sub.jsonl");

  writeFileSync(mainFile, "{}");
  writeFileSync(subFile, "{}");

  const base = Date.now() / 1000;
  utimesSync(mainFile, base - 20, base - 20);
  utimesSync(subFile, base - 10, base - 10); // subagent is newer

  // Should still pick main file, not subagent
  const latest = findLatestClaudeSessionFile(root, { projectName: "project-a" });
  assert.equal(latest, mainFile);

  rmSync(root, { recursive: true });
});

test("getLatestClaudeAssistantMessage filters by sessionId in record", () => {
  const dir = mkdtempSync(join(tmpdir(), "claude-session-filter-"));
  const session = join(dir, "session.jsonl");

  writeFileSync(session, [
    JSON.stringify({
      type: "assistant",
      isSidechain: false,
      sessionId: "session-old",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Old session response." }]
      }
    }),
    JSON.stringify({
      type: "assistant",
      isSidechain: false,
      sessionId: "session-new",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "New session response." }]
      }
    })
  ].join("\n"));

  // Without filter, gets the last one (new session)
  const unfiltered = getLatestClaudeAssistantMessage(session, {
    includeCodeBlocks: false,
    maxCharacters: 1000
  });
  assert.equal(unfiltered.rawText, "New session response.");

  // With sessionId filter for old session
  const filtered = getLatestClaudeAssistantMessage(session, {
    includeCodeBlocks: false,
    maxCharacters: 1000
  }, { sessionId: "session-old" });
  assert.equal(filtered.rawText, "Old session response.");

  // With sessionId filter for non-existent session
  const missing = getLatestClaudeAssistantMessage(session, {
    includeCodeBlocks: false,
    maxCharacters: 1000
  }, { sessionId: "session-missing" });
  assert.equal(missing, null);

  rmSync(dir, { recursive: true });
});

test("findLatestClaudeAssistantMessage with projectName filter", async () => {
  const root = mkdtempSync(join(tmpdir(), "claude-find-project-"));
  const projectA = join(root, "project-a");
  const projectB = join(root, "project-b");

  mkdirSync(projectA, { recursive: true });
  mkdirSync(projectB, { recursive: true });

  const fileA = join(projectA, "session.jsonl");
  const fileB = join(projectB, "session.jsonl");

  writeFileSync(fileA, JSON.stringify({
    type: "assistant",
    isSidechain: false,
    message: { role: "assistant", content: [{ type: "text", text: "Project A response." }] }
  }));
  writeFileSync(fileB, JSON.stringify({
    type: "assistant",
    isSidechain: false,
    message: { role: "assistant", content: [{ type: "text", text: "Project B response." }] }
  }));

  const base = Date.now() / 1000;
  utimesSync(fileA, base - 20, base - 20);
  utimesSync(fileB, base - 10, base - 10); // B is newer

  // Without filter, gets newest (project B)
  const unfiltered = await findLatestClaudeAssistantMessage({ projectsDir: root });
  assert.equal(unfiltered.message.rawText, "Project B response.");

  // With project filter for project A
  const filtered = await findLatestClaudeAssistantMessage({
    projectsDir: root,
    projectName: "project-a"
  });
  assert.equal(filtered.message.rawText, "Project A response.");

  rmSync(root, { recursive: true });
});

test("findLatestClaudeAssistantMessage with sessionId filter", async () => {
  const root = mkdtempSync(join(tmpdir(), "claude-find-session-"));
  const project = join(root, "project");
  mkdirSync(project, { recursive: true });

  const file = join(project, "session.jsonl");
  writeFileSync(file, [
    JSON.stringify({
      type: "assistant",
      isSidechain: false,
      sessionId: "sess-1",
      message: { role: "assistant", content: [{ type: "text", text: "Session 1 response." }] }
    }),
    JSON.stringify({
      type: "assistant",
      isSidechain: false,
      sessionId: "sess-2",
      message: { role: "assistant", content: [{ type: "text", text: "Session 2 response." }] }
    })
  ].join("\n"));

  // Filter by sessionId
  const filtered = await findLatestClaudeAssistantMessage({
    projectsDir: root,
    sessionId: "sess-1"
  });
  assert.equal(filtered.message.rawText, "Session 1 response.");
  assert.equal(filtered.message.sessionId, "sess-1");

  rmSync(root, { recursive: true });
});

test("diagnoseLatestClaudeSession returns diagnostic info", async () => {
  const root = mkdtempSync(join(tmpdir(), "claude-diagnose-"));
  const project = join(root, "project");
  mkdirSync(project, { recursive: true });

  const file = join(project, "session.jsonl");
  writeFileSync(file, JSON.stringify({
    type: "assistant",
    isSidechain: false,
    sessionId: "test-session",
    timestamp: "2026-01-01T12:00:00.000Z",
    message: { role: "assistant", content: [{ type: "text", text: "Test response for diagnostics." }] }
  }));

  const diag = await diagnoseLatestClaudeSession({ projectsDir: root });

  assert.equal(diag.found, true);
  assert.equal(diag.sessionFile, file);
  assert.equal(diag.projectName, "project");
  assert.equal(diag.sessionId, "test-session");
  assert.equal(diag.timestamp, "2026-01-01T12:00:00.000Z");
  assert.ok(diag.rawTextLength > 0);
  assert.ok(diag.cleanedTextLength > 0);
  assert.equal(diag.provider, "macos");
  assert.ok(diag.key);

  rmSync(root, { recursive: true });
});

test("diagnoseLatestClaudeSession returns not found for missing transcripts", async () => {
  const root = mkdtempSync(join(tmpdir(), "claude-diagnose-missing-"));
  const diag = await diagnoseLatestClaudeSession({ projectsDir: root });

  assert.equal(diag.found, false);
  assert.equal(diag.reason, "no-session-file");

  rmSync(root, { recursive: true });
});

test("diagnoseLatestClaudeSession returns not found for session with no completed message", async () => {
  const root = mkdtempSync(join(tmpdir(), "claude-diagnose-empty-"));
  const project = join(root, "project");
  mkdirSync(project, { recursive: true });

  const file = join(project, "session.jsonl");
  // Only user prompts, no assistant responses
  writeFileSync(file, JSON.stringify({
    type: "user",
    isSidechain: false,
    message: { role: "user", content: "Hello" }
  }));

  const diag = await diagnoseLatestClaudeSession({ projectsDir: root });

  assert.equal(diag.found, false);
  assert.equal(diag.reason, "no-completed-message");
  assert.equal(diag.sessionFile, file);

  rmSync(root, { recursive: true });
});

test("concurrent sessions: newest mtime wins", async () => {
  const root = mkdtempSync(join(tmpdir(), "claude-concurrent-"));
  const project = join(root, "project");
  mkdirSync(project, { recursive: true });

  const file1 = join(project, "session-1.jsonl");
  const file2 = join(project, "session-2.jsonl");

  writeFileSync(file1, JSON.stringify({
    type: "assistant",
    isSidechain: false,
    sessionId: "sess-1",
    message: { role: "assistant", content: [{ type: "text", text: "Session 1" }] }
  }));
  writeFileSync(file2, JSON.stringify({
    type: "assistant",
    isSidechain: false,
    sessionId: "sess-2",
    message: { role: "assistant", content: [{ type: "text", text: "Session 2" }] }
  }));

  const base = Date.now() / 1000;
  utimesSync(file1, base - 30, base - 30);
  utimesSync(file2, base - 10, base - 10); // file2 is newer

  const result = await findLatestClaudeAssistantMessage({ projectsDir: root });
  assert.equal(result.message.rawText, "Session 2");
  assert.equal(result.message.sessionId, "sess-2");

  // Tie-breaking: same mtime, lexicographically greater path wins
  utimesSync(file1, base - 10, base - 10);
  const result2 = await findLatestClaudeAssistantMessage({ projectsDir: root });
  // file2 > file1 lexicographically, so file2 should win
  assert.equal(result2.sessionFile, file2);

  rmSync(root, { recursive: true });
});

test("resumed/forked session: sessionId match preferred over mtime", async () => {
  const root = mkdtempSync(join(tmpdir(), "claude-resumed-"));
  const project = join(root, "project");
  mkdirSync(project, { recursive: true });

  // Older file with target sessionId
  const oldFile = join(project, "session-old.jsonl");
  writeFileSync(oldFile, JSON.stringify({
    type: "assistant",
    isSidechain: false,
    sessionId: "target-session",
    message: { role: "assistant", content: [{ type: "text", text: "Old but correct session" }] }
  }));

  // Newer file with different sessionId
  const newFile = join(project, "session-new.jsonl");
  writeFileSync(newFile, JSON.stringify({
    type: "assistant",
    isSidechain: false,
    sessionId: "other-session",
    message: { role: "assistant", content: [{ type: "text", text: "New but wrong session" }] }
  }));

  const base = Date.now() / 1000;
  utimesSync(oldFile, base - 30, base - 30);
  utimesSync(newFile, base - 10, base - 10); // newFile is newer

  // Without filter, newest wins
  const unfiltered = await findLatestClaudeAssistantMessage({ projectsDir: root });
  assert.equal(unfiltered.message.rawText, "New but wrong session");

  // With sessionId filter, should match target-session even though older
  const filtered = await findLatestClaudeAssistantMessage({
    projectsDir: root,
    sessionId: "target-session"
  });
  assert.equal(filtered.message.rawText, "Old but correct session");
  assert.equal(filtered.message.sessionId, "target-session");

  rmSync(root, { recursive: true });
});