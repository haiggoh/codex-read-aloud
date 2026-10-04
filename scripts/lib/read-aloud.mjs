import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const appSupportDir = join(homedir(), "Library", "Application Support", "codex-read-aloud");
export const configPath = join(appSupportDir, "config.json");
export const wrapperPath = join(appSupportDir, "wrapper.json");
export const statePath = join(appSupportDir, "state.json");

const defaultConfig = {
  provider: "macos",
  voice: "system",
  voicePreference: [
    "Shelley (English (US))",
    "Sandy (English (US))",
    "Flo (English (US))",
    "Reed (English (US))",
    "Samantha",
    "Alex"
  ],
  rate: null,
  speakMode: "final",
  maxCharacters: 3000,
  includeCodeBlocks: false,
  stopPrevious: true,
  openaiModel: "gpt-4o-mini-tts",
  openaiVoice: "coral",
  openaiApiKeyEnv: "OPENAI_API_KEY",
  openaiApiKeyCommand: [
    "security",
    "find-generic-password",
    "-a",
    "codex-read-aloud",
    "-s",
    "codex-read-aloud-openai-api-key",
    "-w"
  ],
  openaiInstructions: "Speak naturally and warmly, like a calm coding partner reading a concise technical answer aloud. Avoid announcer energy. Keep code identifiers clear.",
  openaiSpeed: 1
};

export function ensureRuntimeFiles() {
  mkdirSync(appSupportDir, { recursive: true });
  if (!existsSync(configPath)) {
    writeJson(configPath, defaultConfig);
  }
}

export function readConfig() {
  ensureRuntimeFiles();
  return { ...defaultConfig, ...readJson(configPath, {}) };
}

export function readWrapper() {
  return readJson(wrapperPath, {});
}

export function writeWrapper(value) {
  ensureRuntimeFiles();
  writeJson(wrapperPath, value);
}

export function readState() {
  return readJson(statePath, {});
}

export function writeState(value) {
  ensureRuntimeFiles();
  writeJson(statePath, value);
}

export function findLatestSessionFile(codexHome = process.env.CODEX_HOME || join(homedir(), ".codex")) {
  const sessionsDir = join(codexHome, "sessions");
  if (!existsSync(sessionsDir)) {
    return null;
  }

  let latest = null;
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
        continue;
      }
      const stats = statSync(fullPath);
      if (!latest || stats.mtimeMs > latest.mtimeMs) {
        latest = { path: fullPath, mtimeMs: stats.mtimeMs };
      }
    }
  };

  visit(sessionsDir);
  return latest?.path ?? null;
}

export function getLatestAssistantMessage(sessionFile, config = readConfig()) {
  if (!sessionFile || !existsSync(sessionFile)) {
    return null;
  }

  const lines = readFileSync(sessionFile, "utf8").split(/\r?\n/);
  const messages = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }

    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    const payload = record.payload;
    if (record.type !== "response_item" || payload?.type !== "message" || payload.role !== "assistant") {
      continue;
    }

    const text = extractMessageText(payload.content);
    if (!text.trim()) {
      continue;
    }

    messages.push({
      key: messageKey(sessionFile, index, text),
      line: index + 1,
      phase: payload.phase || "unknown",
      timestamp: record.timestamp || null,
      rawText: text,
      text: prepareSpeechText(text, config)
    });
  }

  if (messages.length === 0) {
    return null;
  }

  if (config.speakMode === "all") {
    return messages.at(-1);
  }

  return [...messages].reverse().find((message) => message.phase === "final") ?? messages.at(-1);
}

export function prepareSpeechText(text, config = readConfig()) {
  let output = text;

  if (!config.includeCodeBlocks) {
    output = output.replace(/```[\s\S]*?```/g, " Code block omitted. ");
  }

  // Normalize Markdown for speech
  output = output
    // Images: remove entirely (no alt text in speech)
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    // Links: keep link text, drop URL
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    // Inline code: keep text, drop backticks
    .replace(/`([^`]+)`/g, "$1")
    // Headings: remove # markers
    .replace(/^#{1,6}\s+/gm, "")
    // Blockquotes: remove > markers
    .replace(/^>\s?/gm, "")
    // List markers: remove - * + at line start
    .replace(/^\s*[-*+]\s+/gm, "")
    // Numbered lists: remove "1. " etc.
    .replace(/^\s*\d+\.\s+/gm, "")
    // Horizontal rules: replace with pause indicator
    .replace(/^---+$/gm, " Section break. ")
    .replace(/^\*\*\*+$/gm, " Section break. ")
    // Tables: convert to readable format (basic)
    .replace(/\|([^|]+)\|([^|]+)\|/g, "$1, $2. ")
    // Bold/italic: remove markers
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // Collapse multiple spaces/newlines
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  const maxCharacters = Number(config.maxCharacters) || defaultConfig.maxCharacters;
  if (output.length > maxCharacters) {
    return `${output.slice(0, maxCharacters).trim()}...`;
  }

  return output;
}

/**
 * Split text into chunks at paragraph/sentence boundaries for long-turn handling.
 * @param {string} text - Text to chunk
 * @param {Object} options - Chunking options
 * @param {number} [options.maxChunkCharacters=2000] - Maximum characters per chunk
 * @param {number} [options.overlapCharacters=50] - Overlap between chunks for context
 * @returns {string[]} Array of text chunks
 */
export function chunkText(text, options = {}) {
  const maxChunkCharacters = options.maxChunkCharacters || 2000;
  const overlapCharacters = Math.min(options.overlapCharacters || 50, maxChunkCharacters * 0.2);

  if (text.length <= maxChunkCharacters) {
    return [text];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChunkCharacters) {
      chunks.push(remaining.trim());
      break;
    }

    // Find best split point within maxChunkCharacters
    let splitIndex = maxChunkCharacters;

    // Prefer paragraph break (double newline)
    const paragraphBreak = remaining.lastIndexOf("\n\n", maxChunkCharacters);
    if (paragraphBreak > maxChunkCharacters * 0.5) {
      splitIndex = paragraphBreak + 2; // Include the newlines
    } else {
      // Fall back to sentence boundary (. ? !)
      const sentenceEnds = [". ", "? ", "! "];
      let bestSentence = -1;
      for (const end of sentenceEnds) {
        const idx = remaining.lastIndexOf(end, maxChunkCharacters);
        if (idx > bestSentence) {
          bestSentence = idx + end.length;
        }
      }
      if (bestSentence > maxChunkCharacters * 0.5) {
        splitIndex = bestSentence;
      } else {
        // Fall back to clause boundary (, ;)
        const clauseEnds = [", ", "; "];
        let bestClause = -1;
        for (const end of clauseEnds) {
          const idx = remaining.lastIndexOf(end, maxChunkCharacters);
          if (idx > bestClause) {
            bestClause = idx + end.length;
          }
        }
        if (bestClause > maxChunkCharacters * 0.3) {
          splitIndex = bestClause;
        }
        // Otherwise hard split at maxChunkCharacters
      }
    }

    const chunk = remaining.slice(0, splitIndex).trim();
    chunks.push(chunk);

    // Move forward with overlap for context continuity
    const nextStart = Math.max(0, splitIndex - overlapCharacters);
    remaining = remaining.slice(nextStart).trimStart();
  }

  return chunks;
}

export async function speakText(text, config = readConfig()) {
  const cleanText = text.trim();
  if (!cleanText) {
    return { spoken: false, reason: "empty" };
  }

  if (process.env.CODEX_READ_ALOUD_DRY_RUN === "1") {
    process.stdout.write(`${cleanText}\n`);
    return { spoken: false, reason: "dry-run" };
  }

  if (config.stopPrevious !== false) {
    stopPreviousPlayback();
  }

  const result = config.provider === "openai"
    ? await speakWithOpenAI(cleanText, config)
    : speakWithMacOS(cleanText, config);

  if (result.spoken && result.playback) {
    recordPlaybackState(result.playback);
  }

  return result;
}

export function recordPlaybackState(playback) {
  writeState(buildPlaybackState(readState(), playback));
}

export function buildPlaybackState(previousState, playback) {
  return {
    ...previousState,
    playback,
    lastPlaybackAt: new Date().toISOString()
  };
}

export function stopPreviousPlayback() {
  const state = readState();
  const playback = state.playback || {};
  const stopped = stopPlaybackProcess(playback) || stopLegacyPlayback(playback);

  if (stopped) {
    writeState({
      ...state,
      playback: null,
      lastStoppedAt: new Date().toISOString()
    });
    return true;
  }

  writeState({
    ...state,
    playback: null,
    lastStopAttemptAt: new Date().toISOString()
  });
  return false;
}

export async function speakLatestAssistantMessage() {
  const config = readConfig();
  const state = readState();
  const sessionFile = findLatestSessionFile();
  const message = getLatestAssistantMessage(sessionFile, config);

  if (!message) {
    return { spoken: false, reason: "no-message" };
  }

  if (state.lastSpokenKey === message.key) {
    return { spoken: false, reason: "already-spoken" };
  }

  if (!message.text) {
    return { spoken: false, reason: "empty-after-cleanup" };
  }

  const result = await speakText(message.text, config);
  if (result.spoken) {
    writeState({
      ...state,
      lastSessionFile: sessionFile,
      lastSpokenKey: message.key,
      lastSpokenAt: new Date().toISOString(),
      lastSpokenLine: message.line,
      playback: result.playback || state.playback || null
    });
  }

  return { ...result, message };
}

export async function speakLatestCodexAssistantMessage() {
  const config = readConfig();
  const sessionFile = findLatestSessionFile();
  const message = getLatestAssistantMessage(sessionFile, config);

  if (!message) {
    return { spoken: false, reason: "no-message" };
  }

  if (!message.text) {
    return { spoken: false, reason: "empty-after-cleanup" };
  }

  const result = await speakText(message.text, config);
  return { ...result, message };
}

export async function readStdin() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

function extractMessageText(content) {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part?.text === "string") {
        return part.text;
      }
      if (typeof part?.output_text === "string") {
        return part.output_text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function messageKey(sessionFile, lineIndex, text) {
  const digest = createHash("sha256").update(text).digest("hex").slice(0, 16);
  return `${sessionFile}:${lineIndex}:${digest}`;
}

function speakWithMacOS(text, config) {
  if (process.platform !== "darwin" || !commandExists("say")) {
    const reason = process.platform === "darwin" ? "missing-say" : "unsupported-platform";
    warn(`macOS speech unavailable: ${reason}`);
    return { spoken: false, reason };
  }

  const args = [];
  const voice = resolveMacOSVoice(config.voice, config.voicePreference);
  if (voice) {
    args.push("-v", voice);
  }
  if (config.rate) {
    args.push("-r", String(config.rate));
  }
  // Use stdin for text input (privacy: text not in process arguments)
  args.push("-f", "/dev/stdin");

  const child = spawn("say", args, {
    detached: true,
    stdio: ["pipe", "ignore", "ignore"]
  });

  child.stdin.write(text);
  child.stdin.end();

  child.on("error", (error) => warn(`say failed: ${error.message}`));
  child.unref();

  return {
    spoken: true,
    provider: "macos",
    playback: {
      pid: child.pid,
      provider: "macos",
      voice,
      textNeedle: text.slice(0, 80),
      startedAt: new Date().toISOString()
    }
  };
}

export function resolveMacOSVoice(voice, voicePreference = defaultConfig.voicePreference, availableVoices = listMacOSVoices()) {
  const voiceName = String(voice || "system");
  if (voiceName === "system" || voiceName === "default") {
    return "";
  }

  const preferredVoices = Array.isArray(voicePreference) ? voicePreference : defaultConfig.voicePreference;
  const availableNames = availableVoices.map((item) => item.name);
  const availableSet = new Set(availableNames);

  if (voiceName !== "auto") {
    return availableSet.has(voiceName) ? voiceName : firstAvailableVoice(preferredVoices, availableSet) || voiceName;
  }

  return firstAvailableVoice(preferredVoices, availableSet) || availableNames.find((name) => name) || "";
}

export function listMacOSVoices() {
  if (process.platform !== "darwin" || !commandExists("say")) {
    return [];
  }

  const result = spawnSync("say", ["-v", "?"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 3000
  });
  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^(.+?)\s+([a-z]{2}_[A-Z0-9]+)\s+#\s?(.*)$/);
      return match ? { name: match[1].trim(), locale: match[2], sample: match[3] } : null;
    })
    .filter(Boolean);
}

function firstAvailableVoice(preferredVoices, availableSet) {
  return preferredVoices.find((candidate) => availableSet.has(candidate)) || "";
}

async function speakWithOpenAI(text, config) {
  try {
    const apiKey = getOpenAIApiKey(config);
    if (!apiKey) {
      warn("OpenAI provider selected, but no API key was available. Falling back to macOS speech.");
      return speakWithMacOS(text, config);
    }

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.openaiModel || "gpt-4o-mini-tts",
        voice: config.openaiVoice || "alloy",
        input: text,
        instructions: config.openaiInstructions || undefined,
        response_format: "mp3",
        speed: Number(config.openaiSpeed) || undefined
      })
    });

    if (!response.ok) {
      warn(`OpenAI speech request failed with HTTP ${response.status}. Falling back to macOS speech.`);
      return speakWithMacOS(text, config);
    }

    if (process.platform !== "darwin" || !commandExists("afplay")) {
      const reason = process.platform === "darwin" ? "missing-afplay" : "unsupported-platform";
      warn(`OpenAI audio playback unavailable: ${reason}`);
      return { spoken: false, reason };
    }

    const audioPath = join(tmpdir(), `codex-read-aloud-${Date.now()}.mp3`);
    const audio = Buffer.from(await response.arrayBuffer());
    writeFileSync(audioPath, audio);

    const child = spawn("afplay", [audioPath], {
      detached: true,
      stdio: "ignore"
    });
    child.on("error", (error) => warn(`afplay failed: ${error.message}`));
    child.unref();

    return {
      spoken: true,
      provider: "openai",
      playback: {
        pid: child.pid,
        provider: "openai",
        audioPath,
        textNeedle: text.slice(0, 80),
        startedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    warn(`OpenAI speech failed: ${error.message}. Falling back to macOS speech.`);
    return speakWithMacOS(text, config);
  }
}

function getOpenAIApiKey(config) {
  const envKey = process.env[config.openaiApiKeyEnv || "OPENAI_API_KEY"];
  if (envKey) {
    return envKey;
  }

  if (!Array.isArray(config.openaiApiKeyCommand) || config.openaiApiKeyCommand.length === 0) {
    return "";
  }

  const [command, ...args] = config.openaiApiKeyCommand;
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 3000
  });

  if (result.status !== 0) {
    return "";
  }

  return result.stdout.trim();
}

function debugLog(message) {
  if (process.env.CODEX_READ_ALOUD_DEBUG === "1") {
    process.stderr.write(`[codex-read-aloud] ${message}\n`);
  }
}

function warn(message) {
  process.stderr.write(`[codex-read-aloud] ${message}\n`);
}

function commandExists(command) {
  return spawnSync("which", [command], { stdio: "ignore" }).status === 0;
}

function stopPlaybackProcess(playback) {
  const pid = Number(playback?.pid);
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  let stopped = false;
  for (const target of [pid, -pid]) {
    try {
      process.kill(target, "SIGTERM");
      stopped = true;
    } catch {
      // Try the next target. Detached children may be process-group leaders.
    }
  }

  return stopped;
}

function stopLegacyPlayback(playback) {
  if (process.platform !== "darwin") {
    return false;
  }

  const patterns = [
    "codex-read-aloud-notify.mjs",
    "claude-read-aloud-hook.mjs",
    "afplay",
    "say -v Sandy"
  ];
  if (playback?.audioPath) {
    patterns.push(String(playback.audioPath));
  }
  if (playback?.textNeedle) {
    patterns.push(String(playback.textNeedle));
  }

  return stopMatchingProcesses((command) => {
    if (command.includes("rg ") || command.includes("grep ")) {
      return false;
    }
    if (command.includes("afplay") && !command.includes("codex-read-aloud")) {
      return false;
    }
    return patterns.some((pattern) => command.includes(pattern));
  });
}

function stopMatchingProcesses(matchesCommand) {
  const result = spawnSync("ps", ["-axo", "pid=,command="], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });

  if (result.status !== 0) {
    return false;
  }

  let stopped = false;
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(.+)$/);
    if (!match) {
      continue;
    }

    const pid = Number(match[1]);
    const command = match[2];
    if (pid === process.pid || !matchesCommand(command)) {
      continue;
    }

    stopped = stopPlaybackProcess({ pid }) || stopped;
  }

  return stopped;
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
