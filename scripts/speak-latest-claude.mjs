#!/usr/bin/env node
import {
  readConfig,
  speakText
} from "./lib/read-aloud.mjs";
import {
  findLatestClaudeAssistantMessage
} from "./lib/claude-sessions.mjs";

const config = readConfig();

const latest = await findLatestClaudeAssistantMessage({
  projectsDir:
    process.env.CODEX_READ_ALOUD_CLAUDE_PROJECTS_DIR ||
    undefined,
  config
});

if (!latest?.message) {
  process.stdout.write(
    "Did not speak: no-completed-claude-message\n"
  );
  process.exit(0);
}

if (!latest.message.text) {
  process.stdout.write(
    "Did not speak: empty-after-cleanup\n"
  );
  process.exit(0);
}

const result = await speakText(latest.message.text, config);

process.stdout.write(
  result.spoken
    ? "Started speech playback.\n"
    : `Did not speak: ${result.reason || "unknown"}\n`
);
