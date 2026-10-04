#!/usr/bin/env node
/**
 * turn-speak — Extended TurnSpeak CLI
 *
 * Subcommands:
 *   turn-speak latest [--project <path>] [--session <id>] [--diagnose]
 *   turn-speak stop
 *   turn-speak --version
 *   turn-speak --help
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve, basename } from "node:path";
import {
  findLatestClaudeAssistantMessage,
  diagnoseLatestClaudeSession
} from "./lib/claude-sessions.mjs";
import { readConfig, stopPreviousPlayback } from "./lib/read-aloud.mjs";
import { MLXClient } from "./lib/mlx-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const VERSION = "0.2.0-dev";

function printHelp() {
  console.log(`turn-speak v${VERSION} — Read Claude Code responses aloud

Usage:
  turn-speak latest [options]    Read newest completed main-agent response (default)
  turn-speak stop                Stop current playback
  turn-speak --version           Show version
  turn-speak --help              Show this help

Options for 'latest':
  --projects-dir <path>  Custom projects directory (default: ~/.claude/projects)
  --project <path>       Limit to project directory name (e.g., --project "claude-project")
  --session <id>         Limit to specific session ID
  --diagnose             Show selection reasoning (file, line, sessionId, timestamp)
  --provider <name>      Provider: macos, mlx, openai (default: config)
  --model <name>         MLX model: kokoro, qwen3-06b, qwen3-17b, chatterbox
  --voice <name>         Voice for selected provider

Examples:
  turn-speak latest
  turn-speak latest --projects-dir "/custom/path" --project "my-project" --diagnose
  turn-speak latest --project "\$PWD" --diagnose
  turn-speak latest --provider mlx --model kokoro --voice af_heart
  turn-speak stop`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "latest") {
    // Default subcommand is 'latest'
    const subcommand = args[0] === "latest" ? args.shift() : "latest";
    await handleLatest(args);
  } else if (args[0] === "stop") {
    await handleStop();
  } else if (args[0] === "--version" || args[0] === "-v") {
    console.log(`turn-speak v${VERSION}`);
  } else if (args[0] === "--help" || args[0] === "-h") {
    printHelp();
  } else {
    console.error(`Unknown command: ${args[0]}`);
    console.error("Run 'turn-speak --help' for usage.");
    process.exit(1);
  }
}

async function handleLatest(argv) {
  const config = readConfig();

  // Parse options
  const options = {
    projectsDir: undefined,
    projectName: undefined,
    sessionId: undefined,
    diagnose: false,
    provider: config.provider,
    model: undefined,
    voice: undefined
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--project" && i + 1 < argv.length) {
      // Accept either a full path or just the project directory name
      const projectPath = argv[++i];
      options.projectName = basename(projectPath);
    } else if (arg === "--projects-dir" && i + 1 < argv.length) {
      options.projectsDir = argv[++i];
    } else if (arg === "--session" && i + 1 < argv.length) {
      options.sessionId = argv[++i];
    } else if (arg === "--diagnose") {
      options.diagnose = true;
    } else if (arg === "--provider" && i + 1 < argv.length) {
      options.provider = argv[++i];
    } else if (arg === "--model" && i + 1 < argv.length) {
      options.model = argv[++i];
    } else if (arg === "--voice" && i + 1 < argv.length) {
      options.voice = argv[++i];
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  // Validate provider
  const validProviders = ["macos", "mlx", "openai"];
  if (!validProviders.includes(options.provider)) {
    console.error(`Provider '${options.provider}' not yet implemented. Use 'macos', 'mlx', or 'openai'.`);
    process.exit(1);
  }

  if (options.diagnose) {
    const diag = await diagnoseLatestClaudeSession({
      projectsDir: options.projectsDir,
      projectName: options.projectName,
      sessionId: options.sessionId,
      config: { ...config, provider: options.provider }
    });

    if (!diag.found) {
      console.error("=== Selection Diagnostics ===");
      console.error(`Found: false`);
      console.error(`Reason: ${diag.reason}`);
      if (diag.sessionFile) console.error(`Session file: ${diag.sessionFile}`);
      if (diag.fileMtime) console.error(`File mtime: ${diag.fileMtime}`);
      if (diag.projectName) console.error(`Project: ${diag.projectName}`);
      console.error("==============================");
      process.stdout.write("No completed main-agent response found.\n");
      process.exit(0);
    }

    console.error("=== Selection Diagnostics ===");
    console.error(`Found: true`);
    console.error(`Session file: ${diag.sessionFile}`);
    console.error(`File mtime: ${diag.fileMtime}`);
    console.error(`File size: ${diag.fileSize} bytes`);
    console.error(`Project: ${diag.projectName}`);
    console.error(`Line: ${diag.line}`);
    console.error(`Session ID: ${diag.sessionId || "unknown"}`);
    console.error(`Timestamp: ${diag.timestamp || "none"}`);
    console.error(`Key: ${diag.key}`);
    console.error(`Raw text length: ${diag.rawTextLength}`);
    console.error(`Cleaned text length: ${diag.cleanedTextLength}`);
    console.error(`Provider: ${diag.provider}`);
    console.error("==============================");
  }

  const result = await findLatestClaudeAssistantMessage({
    projectsDir: options.projectsDir,
    projectName: options.projectName,
    sessionId: options.sessionId,
    config: { ...config, provider: options.provider }
  });

  if (!result?.message) {
    const msg = options.diagnose
      ? "No completed main-agent response found."
      : "Did not speak: no-completed-claude-message";
    process.stdout.write(msg + "\n");
    process.exit(0);
  }

  if (!result.message.text) {
    const msg = options.diagnose
      ? "Found response but empty after Markdown cleanup."
      : "Did not speak: empty-after-cleanup";
    process.stdout.write(msg + "\n");
    process.exit(0);
  }

  let speakResult;

  if (options.provider === "mlx") {
    // Use MLX provider
    const mlxClient = new MLXClient();

    try {
      // Health check
      const health = await mlxClient.health();
      if (!health.ok) {
        throw new Error("MLX worker not healthy");
      }

      // Load model if specified
      if (options.model) {
        const modelPaths = {
          kokoro: "~/.models/Kokoro-82M-bf16",
          "qwen3-06b": "~/.models/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit",
          "qwen3-17b": "~/.models/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16",
          chatterbox: "~/.models/chatterbox-turbo-8bit"
        };
        const modelPath = modelPaths[options.model];
        if (modelPath) {
          await mlxClient.loadModel(options.model, modelPath);
        }
      }

      // Speak
      const speakResponse = await mlxClient.speak(result.message.text, {
        model: options.model || "kokoro",
        voice: options.voice || "af_heart",
        speed: 1.0
      });

      if (!speakResponse.ok) {
        throw new Error(speakResponse.error || "MLX speak failed");
      }

      // Play audio file
      const { spawn } = await import("node:child_process");
      const afplay = spawn("afplay", [speakResponse.audio_path], {
        detached: true,
        stdio: "ignore"
      });
      afplay.unref();

      speakResult = {
        spoken: true,
        provider: "mlx",
        playback: {
          pid: afplay.pid,
          provider: "mlx",
          audioPath: speakResponse.audio_path,
          textNeedle: result.message.text.slice(0, 80),
          startedAt: new Date().toISOString()
        }
      };
    } catch (e) {
      console.error(`MLX error: ${e.message}`);
      console.error("Falling back to macOS speech...");
      const { speakText } = await import("./lib/read-aloud.mjs");
      const speakConfig = { ...config, provider: "macos" };
      speakResult = await speakText(result.message.text, speakConfig);
    }
  } else {
    // Use macOS provider (default)
    const { speakText } = await import("./lib/read-aloud.mjs");
    const speakConfig = { ...config, provider: options.provider };
    speakResult = await speakText(result.message.text, speakConfig);
  }

  process.stdout.write(
    speakResult.spoken
      ? "Started speech playback.\n"
      : `Did not speak: ${speakResult.reason || "unknown"}\n`
  );
}

async function handleStop() {
  const stopped = stopPreviousPlayback();
  if (stopped) {
    process.stdout.write("Stopped playback.\n");
  } else {
    process.stdout.write("No active playback to stop.\n");
  }
}

main().catch((error) => {
  console.error(`turn-speak error: ${error.message}`);
  process.exit(1);
});