import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync
} from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import {
  prepareSpeechText,
  readConfig
} from "./read-aloud.mjs";

export function defaultClaudeProjectsDir(
  claudeConfigDir = process.env.CLAUDE_CONFIG_DIR ||
    join(homedir(), ".claude")
) {
  return join(claudeConfigDir, "projects");
}

export function findLatestClaudeSessionFile(
  projectsDir = defaultClaudeProjectsDir()
) {
  if (!existsSync(projectsDir)) {
    return null;
  }

  let latest = null;

  const visit = (directory) => {
    for (const entry of readdirSync(directory, {
      withFileTypes: true
    })) {
      const fullPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === "subagents") {
          continue;
        }
        visit(fullPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
        continue;
      }

      const relativeParts = relative(
        projectsDir,
        fullPath
      ).split(sep);

      if (relativeParts.includes("subagents")) {
        continue;
      }

      const stats = statSync(fullPath);
      const candidate = {
        path: fullPath,
        mtimeMs: stats.mtimeMs
      };

      if (
        !latest ||
        candidate.mtimeMs > latest.mtimeMs ||
        (
          candidate.mtimeMs === latest.mtimeMs &&
          candidate.path > latest.path
        )
      ) {
        latest = candidate;
      }
    }
  };

  visit(projectsDir);
  return latest?.path ?? null;
}

export function getLatestClaudeAssistantMessage(
  sessionFile,
  config = readConfig()
) {
  if (!sessionFile || !existsSync(sessionFile)) {
    return null;
  }

  const lines = readFileSync(sessionFile, "utf8").split(/\r?\n/);
  let candidate = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (!line) {
      continue;
    }

    let record;

    try {
      record = JSON.parse(line);
    } catch {
      // A concurrently written final JSONL line may be incomplete.
      // Invalidate earlier prose so the caller retries instead of
      // replaying a response from before the unfinished record.
      candidate = null;
      continue;
    }

    if (record?.isSidechain === true) {
      continue;
    }

    if (isClaudeUserPrompt(record)) {
      candidate = null;
      continue;
    }

    if (
      record?.type !== "assistant" ||
      record?.message?.role !== "assistant"
    ) {
      continue;
    }

    if (
      record?.isApiErrorMessage === true ||
      record?.error ||
      record?.apiErrorStatus
    ) {
      candidate = null;
      continue;
    }

    const content = record.message.content;
    const extracted = extractClaudeContent(content);

    // A later tool-use record means the turn has not yet produced its
    // subsequent final prose. Do not replay an earlier progress message.
    if (extracted.hasToolUse) {
      candidate = null;
      continue;
    }

    // Thinking, metadata, and other non-text assistant records do not
    // supersede a completed text response within the same prompt.
    if (!extracted.text.trim()) {
      continue;
    }

    candidate = {
      key: messageKey(sessionFile, index, extracted.text),
      line: index + 1,
      timestamp: record.timestamp || null,
      rawText: extracted.text,
      text: prepareSpeechText(extracted.text, config)
    };
  }

  return candidate;
}

export async function findLatestClaudeAssistantMessage({
  projectsDir = defaultClaudeProjectsDir(),
  config = readConfig(),
  attempts = 5,
  delayMs = 75
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const sessionFile = findLatestClaudeSessionFile(projectsDir);
    const message = getLatestClaudeAssistantMessage(
      sessionFile,
      config
    );

    if (message) {
      return { sessionFile, message };
    }

    if (attempt + 1 < attempts) {
      await delay(delayMs);
    }
  }

  return null;
}

function isClaudeUserPrompt(record) {
  if (
    record?.type !== "user" ||
    record?.message?.role !== "user"
  ) {
    return false;
  }

  const content = record.message.content;

  if (typeof content === "string") {
    return Boolean(content.trim());
  }

  if (!Array.isArray(content)) {
    return false;
  }

  return content.some((part) => {
    if (!part || typeof part !== "object") {
      return false;
    }

    return part.type !== "tool_result";
  });
}

function extractClaudeContent(content) {
  if (typeof content === "string") {
    return {
      text: content,
      hasToolUse: false
    };
  }

  if (!Array.isArray(content)) {
    return {
      text: "",
      hasToolUse: false
    };
  }

  const textParts = [];
  let hasToolUse = false;

  for (const part of content) {
    if (!part || typeof part !== "object") {
      continue;
    }

    if (part.type === "tool_use") {
      hasToolUse = true;
      continue;
    }

    if (part.type === "text" && typeof part.text === "string") {
      textParts.push(part.text);
    }
  }

  return {
    text: textParts.join("\n\n"),
    hasToolUse
  };
}

function messageKey(sessionFile, lineIndex, text) {
  const digest = createHash("sha256")
    .update(text)
    .digest("hex")
    .slice(0, 16);

  return `${sessionFile}:${lineIndex}:${digest}`;
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
