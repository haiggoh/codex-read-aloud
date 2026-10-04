#!/usr/bin/env node
/**
 * MLX-Audio persistent worker for TurnSpeak.
 * Listens on Unix domain socket for TTS requests.
 * Keeps models warm in memory for fast inference.
 */

import { createServer } from "node:net";
import { existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const TURN_SPEAK_DIR = join(homedir(), ".turn-speak");
const RUNTIME_DIR = join(TURN_SPEAK_DIR, "runtime");
const WORKER_SOCKET = join(RUNTIME_DIR, "worker.sock");
const WORKER_PID_FILE = join(RUNTIME_DIR, "worker.pid");
const MLX_VENV_PYTHON = join(RUNTIME_DIR, "mlx-audio", "bin", "python");

// Model paths (symlinks to ~/.models/)
const MODEL_PATHS = {
  kokoro: join(homedir(), ".models", "Kokoro-82M-bf16"),
  "qwen3-06b": join(homedir(), ".models", "Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit"),
  "qwen3-17b": join(homedir(), ".models", "Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16"),
  chatterbox: join(homedir(), ".models", "chatterbox-turbo-8bit")
};

// Default voices per model
const DEFAULT_VOICES = {
  kokoro: "af_heart",
  "qwen3-06b": "serena",
  "qwen3-17b": "serena",
  chatterbox: "default"
};

// Python worker process
let pythonWorker = null;
let loadedModelName = null;

function cleanupSocket() {
  try {
    if (existsSync(WORKER_SOCKET)) {
      unlinkSync(WORKER_SOCKET);
    }
  } catch (e) {
    // Ignore
  }
}

function writePidFile() {
  try {
    const fs = require("node:fs");
    fs.writeFileSync(WORKER_PID_FILE, String(process.pid));
  } catch (e) {
    // Ignore
  }
}

function removePidFile() {
  try {
    if (existsSync(WORKER_PID_FILE)) {
      unlinkSync(WORKER_PID_FILE);
    }
  } catch (e) {
    // Ignore
  }
}

function startPythonWorker() {
  return new Promise((resolve, reject) => {
    console.log("Starting MLX Python worker...");

    const workerScript = `
import sys
import json
import os
import tempfile
import numpy as np

from mlx_audio.tts.generate import generate_audio, load_model

# Model cache: {model_name: loaded_model_object}
loaded_models = {}
loaded_model_name = None

def get_model(model_name, model_path):
    """Load or return cached model."""
    global loaded_model_name
    if model_name not in loaded_models:
        print(f"Loading {model_name} from {model_path}", file=sys.stderr)
        model = load_model(model_path)
        loaded_models[model_name] = model
    loaded_model_name = model_name
    return loaded_models[model_name]

def handle_request(request):
    """Handle a single request."""
    global loaded_model_name
    req_type = request.get("type")

    if req_type == "health":
        return {
            "type": "health",
            "ok": True,
            "model": loaded_model_name,
            "loaded": loaded_model_name is not None
        }

    elif req_type == "load":
        model_name = request.get("model")
        model_path = request.get("model_path")

        try:
            get_model(model_name, model_path)
            return {"type": "load", "ok": True, "model": model_name}
        except Exception as e:
            return {"type": "load", "ok": False, "error": str(e)}

    elif req_type == "speak":
        model_name = request.get("model", "kokoro")
        text = request.get("text")
        voice = request.get("voice", DEFAULT_VOICES.get(model_name, "af_heart"))
        speed = request.get("speed", 1.0)
        model_path = request.get("model_path")

        try:
            model = get_model(model_name, model_path)

            # Prepare output directory
            tmp_dir = tempfile.mkdtemp(prefix="turnspeak_")

            # Generate audio using high-level API
            generate_audio(
                text=text,
                model=model,
                voice=voice,
                speed=speed,
                lang_code="en",
                output_path=tmp_dir,
                file_prefix="turnspeak",
                audio_format="wav",
                save=True,
                verbose=False
            )

            # Find the generated file
            import glob
            wav_files = glob.glob(os.path.join(tmp_dir, "*.wav"))
            if wav_files:
                audio_path = wav_files[0]
            else:
                raise RuntimeError("No audio file generated")

            return {
                "type": "speak",
                "ok": True,
                "audio_path": audio_path,
                "sample_rate": 24000
            }
        except Exception as e:
            import traceback
            return {"type": "speak", "ok": False, "error": str(e), "traceback": traceback.format_exc()}

    elif req_type == "stop":
        return {"type": "stop", "ok": True}

    elif req_type == "status":
        return {
            "type": "status",
            "playing": False,
            "current_model": loaded_model_name,
            "queue_depth": 0
        }

    elif req_type == "shutdown":
        return {"type": "shutdown", "ok": True}

    return {"type": "error", "error": f"Unknown request type: {req_type}"}

# Default voices per model
DEFAULT_VOICES = {
    "kokoro": "af_heart",
    "qwen3-06b": "custom",
    "qwen3-17b": "custom",
    "chatterbox": "default"
}

# Main loop
print("MLX worker ready", file=sys.stderr)
sys.stderr.flush()

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        request = json.loads(line)
        response = handle_request(request)
        print(json.dumps(response), flush=True)
    except Exception as e:
        import traceback
        print(json.dumps({"type": "error", "error": str(e), "traceback": traceback.format_exc()}), flush=True)
    `;

    pythonWorker = spawn(MLX_VENV_PYTHON, ["-c", workerScript], {
      stdio: ["pipe", "pipe", "inherit"]
    });

    pythonWorker.on("error", (err) => {
      console.error("Python worker error:", err.message);
      reject(err);
    });

    pythonWorker.on("exit", (code) => {
      console.log(`Python worker exited with code ${code}`);
    });

    // Give it a moment to start
    setTimeout(resolve, 1000);
  });
}

function sendToPython(request) {
  return new Promise((resolve, reject) => {
    if (!pythonWorker || pythonWorker.killed) {
      reject(new Error("Python worker not running"));
      return;
    }

    const requestLine = JSON.stringify(request) + "\n";
    pythonWorker.stdin.write(requestLine);

    let responseBuffer = "";

    // Read response from stdout
    const onData = (data) => {
      responseBuffer += data.toString();

      // Process complete lines
      const lines = responseBuffer.split("\n");
      responseBuffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const response = JSON.parse(line);
          pythonWorker.stdout.off("data", onData);
          resolve(response);
          return;
        } catch (e) {
          // Not a complete JSON line yet
        }
      }
    };

    pythonWorker.stdout.on("data", onData);

    // Timeout after 60 seconds (model loading can take time)
    setTimeout(() => {
      pythonWorker.stdout.off("data", onData);
      reject(new Error("Python worker timeout"));
    }, 120000);
  });
}

async function handleConnection(socket) {
  let buffer = "";

  socket.on("data", async (data) => {
    buffer += data.toString();

    // Process complete lines
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const request = JSON.parse(line);
        let response;

        switch (request.type) {
          case "health":
            response = {
              type: "health",
              ok: true,
              model: loadedModelName,
              loaded: loadedModelName !== null,
              python_ready: pythonWorker !== null
            };
            break;

          case "load":
            response = await sendToPython(request);
            if (response.ok) {
              loadedModelName = request.model;
            }
            break;

          case "speak":
            response = await sendToPython(request);
            break;

          case "stop":
            response = { type: "stop", ok: true };
            break;

          case "status":
            response = {
              type: "status",
              playing: false,
              current_model: loadedModelName,
              queue_depth: 0
            };
            break;

          case "shutdown":
            response = { type: "shutdown", ok: true };
            socket.write(JSON.stringify(response) + "\n");
            await shutdown();
            return;

          default:
            response = { type: "error", error: `Unknown request type: ${request.type}` };
        }

        socket.write(JSON.stringify(response) + "\n");
      } catch (e) {
        socket.write(JSON.stringify({ type: "error", error: e.message }) + "\n");
      }
    }
  });

  socket.on("error", (err) => {
    console.error("Socket error:", err.message);
  });
}

async function shutdown() {
  console.log("Shutting down...");

  if (pythonWorker && !pythonWorker.killed) {
    pythonWorker.kill("SIGTERM");
    pythonWorker = null;
  }

  cleanupSocket();
  removePidFile();
  process.exit(0);
}

// Setup signal handlers
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Main
async function main() {
  cleanupSocket();
  writePidFile();

  // Ensure runtime directory exists
  const { mkdirSync } = await import("node:fs");
  mkdirSync(RUNTIME_DIR, { recursive: true });

  // Check Python venv exists
  if (!existsSync(MLX_VENV_PYTHON)) {
    console.error(`Python venv not found at ${MLX_VENV_PYTHON}`);
    console.error("Run: node scripts/install-mlx-runtime.mjs");
    process.exit(1);
  }

  // Start Python worker
  try {
    await startPythonWorker();
  } catch (e) {
    console.error("Failed to start Python worker:", e.message);
    process.exit(1);
  }

  // Create Unix domain socket server
  const server = createServer(handleConnection);

  server.listen(WORKER_SOCKET, () => {
    console.log(`MLX worker listening on ${WORKER_SOCKET}`);
    console.log("Ready for requests");
  });

  server.on("error", (err) => {
    console.error("Server error:", err.message);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});