#!/usr/bin/env node
/**
 * MLX-Audio client for TurnSpeak.
 * Communicates with the persistent MLX worker via Unix domain socket.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { createConnection } from "node:net";

const TURN_SPEAK_DIR = join(homedir(), ".turn-speak");
const RUNTIME_DIR = join(TURN_SPEAK_DIR, "runtime");
const WORKER_SOCKET = join(RUNTIME_DIR, "worker.sock");

const DEFAULT_TIMEOUT = 120000; // 2 minutes for cold start

class MLXClient {
  constructor(socketPath = WORKER_SOCKET, timeout = DEFAULT_TIMEOUT) {
    this.socketPath = socketPath;
    this.timeout = timeout;
  }

  async sendRequest(request) {
    return new Promise((resolve, reject) => {
      const socket = createConnection(this.socketPath);

      let buffer = "";
      let resolved = false;

      const cleanup = () => {
        socket.destroy();
      };

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error(`Request timeout after ${this.timeout}ms`));
        }
      }, this.timeout);

      socket.on("connect", () => {
        socket.write(JSON.stringify(request) + "\n");
      });

      socket.on("data", (data) => {
        buffer += data.toString();

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const response = JSON.parse(line);
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              cleanup();
              resolve(response);
            }
          } catch (e) {
            // Incomplete JSON, wait for more data
          }
        }
      });

      socket.on("error", (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          reject(new Error(`Socket error: ${err.message}`));
        }
      });

      socket.on("close", () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          reject(new Error("Socket closed unexpectedly"));
        }
      });
    });
  }

  async health() {
    return this.sendRequest({ type: "health" });
  }

  async loadModel(modelName, modelPath) {
    return this.sendRequest({
      type: "load",
      model: modelName,
      model_path: modelPath
    });
  }

  async speak(text, options = {}) {
    return this.sendRequest({
      type: "speak",
      model: options.model || "kokoro",
      text,
      voice: options.voice || "af_heart",
      speed: options.speed || 1.0,
      model_path: options.modelPath
    });
  }

  async stop() {
    return this.sendRequest({ type: "stop" });
  }

  async status() {
    return this.sendRequest({ type: "status" });
  }

  async shutdown() {
    return this.sendRequest({ type: "shutdown" });
  }
}

export { MLXClient, WORKER_SOCKET };