import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync
} from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep, basename, dirname } from "node:path";
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

/**
 * Find the latest Claude session file with optional project/session filtering.
 * @param {string} projectsDir - Root projects directory
 * @param {Object} options - Filter options
 * @param {string} [options.projectName] - Limit to specific project directory name
 * @param {string} [options.sessionId] - Limit to specific session ID (matches record.sessionId)
 * @returns {string|null} Path to latest session file or null
 */
export function findLatestClaudeSessionFile(
  projectsDir = defaultClaudeProjectsDir(),
  options = {}
) {
  const { projectName, sessionId } = options;

  if (!existsSync(projectsDir)) {
    return null;
  }

  // If projectName specified, narrow search to that project directory
  let searchDir = projectsDir;
  if (projectName) {
    const projectDir = join(projectsDir, projectName);
    if (!existsSync(projectDir)) {
      return null;
    }
    searchDir = projectDir;
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
        mtimeMs: stats.mtimeMs,
        projectName: relativeParts[0] || "unknown"
      };

      // If sessionId specified, we must read the file to check if it contains that sessionId
      if (sessionId) {
        const lines = readFileSync(fullPath, "utf8").split(/\r?\n/);
        let hasSessionId = false;

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const record = JSON.parse(line);
            if (record?.sessionId === sessionId) {
              hasSessionId = true;
              break;
            }
          } catch {
            // Ignore parse errors
          }
        }

        if (!hasSessionId) {
          continue; // Skip files that don't contain the target sessionId
        }
      }

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

  visit(searchDir);
  return latest?.path ?? null;
}

/**
 * Get the latest completed main-agent assistant message from a session file.
 * @param {string} sessionFile - Path to session JSONL file
 * @param {Object} config - Speech config
 * @param {Object} options - Filter options
 * @param {string} [options.sessionId] - Limit to specific sessionId (matches record.sessionId)
 * @returns {Object|null} Message object or null
 */
export function getLatestClaudeAssistantMessage(
  sessionFile,
  config = readConfig(),
  options = {}
) {
  const { sessionId } = options;

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

    // If sessionId filter provided, check record.sessionId
    if (sessionId && record?.sessionId && record.sessionId !== sessionId) {
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
      sessionId: record.sessionId || null,
      rawText: extracted.text,
      text: prepareSpeechText(extracted.text, config)
    };
  }

  return candidate;
}

/**
 * Find the latest completed main-agent assistant message across sessions.
 * @param {Object} options - Search options
 * @param {string} [options.projectsDir] - Root projects directory
 * @param {string} [options.projectName] - Limit to specific project
 * @param {string} [options.sessionId] - Limit to specific session ID
 * @param {Object} [options.config] - Speech config
 * @param {number} [options.attempts=5] - Retry attempts
 * @param {number} [options.delayMs=75] - Delay between retries (ms)
 * @returns {Promise<Object|null>} { sessionFile, message } or null
 */
export async function findLatestClaudeAssistantMessage({
  projectsDir = defaultClaudeProjectsDir(),
  projectName,
  sessionId,
  config = readConfig(),
  attempts = 5,
  delayMs = 75
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const sessionFile = findLatestClaudeSessionFile(projectsDir, {
      projectName,
      sessionId
    });

    const message = getLatestClaudeAssistantMessage(
      sessionFile,
      config,
      { sessionId }
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

/**
 * Get diagnostic information about the latest session selection.
 * @param {Object} options - Search options (same as findLatestClaudeAssistantMessage)
 * @returns {Promise<Object|null>} Diagnostic info or null
 */
export async function diagnoseLatestClaudeSession({
  projectsDir = defaultClaudeProjectsDir(),
  projectName,
  sessionId,
  config = readConfig(),
  attempts = 5,
  delayMs = 75
} = {}) {
  const sessionFile = findLatestClaudeSessionFile(projectsDir, {
    projectName,
    sessionId
  });

  if (!sessionFile) {
    return {
      found: false,
      reason: "no-session-file",
      projectsDir,
      projectName,
      sessionId
    };
  }

  const stats = statSync(sessionFile);
  const message = getLatestClaudeAssistantMessage(sessionFile, config, { sessionId });

  if (!message) {
    return {
      found: false,
      reason: "no-completed-message",
      sessionFile,
      fileMtime: stats.mtime.toISOString(),
      fileSize: stats.size,
      projectName: projectName || basename(dirname(sessionFile))
    };
  }

  return {
    found: true,
    sessionFile,
    fileMtime: stats.mtime.toISOString(),
    fileSize: stats.size,
    projectName: projectName || basename(dirname(sessionFile)),
    line: message.line,
    timestamp: message.timestamp,
    sessionId: message.sessionId,
    key: message.key,
    rawTextLength: message.rawText.length,
    cleanedTextLength: message.text.length,
    provider: config.provider
  };
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