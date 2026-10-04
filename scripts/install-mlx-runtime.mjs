#!/usr/bin/env node
/**
 * Install and pin MLX-Audio runtime for TurnSpeak.
 * Creates an isolated venv with pinned MLX-Audio version.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const TURN_SPEAK_DIR = join(homedir(), ".turn-speak");
const RUNTIME_DIR = join(TURN_SPEAK_DIR, "runtime");
const MLX_VENV_DIR = join(RUNTIME_DIR, "mlx-audio");
const MLX_REQUIREMENTS = join(RUNTIME_DIR, "mlx-requirements.txt");

// Pinned versions - update when new models require newer MLX-Audio
// Note: mlx-audio 0.5.7 requires huggingface_hub>=1.0, mlx 0.32.x, misaki for Kokoro, num2words for misaki
const PINNED_VERSIONS = {
  "mlx-audio": "0.5.7",
  "mlx": "0.32.3",
  "huggingface-hub": "1.33.0",
  "tokenizers": "0.23.2",
  "misaki": "0.7.4",
  "num2words": "0.5.14"
};

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function writeRequirements() {
  const lines = Object.entries(PINNED_VERSIONS).map(([pkg, ver]) => `${pkg}==${ver}`);
  writeFileSync(MLX_REQUIREMENTS, lines.join("\n") + "\n");
  console.log(`Wrote pinned requirements to ${MLX_REQUIREMENTS}`);
}

function createVenv() {
  console.log(`Creating virtual environment at ${MLX_VENV_DIR}...`);
  const result = spawnSync("uv", ["venv", MLX_VENV_DIR], {
    encoding: "utf8",
    stdio: "inherit"
  });

  if (result.status !== 0) {
    // Fallback to python3 -m venv
    console.log("uv not found, trying python3 -m venv...");
    const result2 = spawnSync("python3", ["-m", "venv", MLX_VENV_DIR], {
      encoding: "utf8",
      stdio: "inherit"
    });
    if (result2.status !== 0) {
      throw new Error("Failed to create virtual environment");
    }
  }
  console.log("Virtual environment created");
}

function installPackages() {
  const python = join(MLX_VENV_DIR, "bin", "python");
  const pip = join(MLX_VENV_DIR, "bin", "pip");

  console.log("Upgrading pip...");
  spawnSync(pip, ["install", "--upgrade", "pip"], { stdio: "inherit" });

  console.log("Installing pinned packages...");
  const result = spawnSync(pip, ["install", "-r", MLX_REQUIREMENTS], {
    encoding: "utf8",
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error("Failed to install packages");
  }
  console.log("Packages installed successfully");
}

function verifyInstallation() {
  const python = join(MLX_VENV_DIR, "bin", "python");

  console.log("Verifying installation...");
  const result = spawnSync(python, ["-c", `
import mlx_audio
import mlx
import huggingface_hub
import tokenizers
print(f"mlx_audio: {mlx_audio.__version__}")
print(f"mlx: {mlx.__version__}")
print(f"huggingface_hub: {huggingface_hub.__version__}")
print(f"tokenizers: {tokenizers.__version__}")
  `], {
    encoding: "utf8",
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error("Verification failed");
  }
  console.log("✅ Verification successful");
}

function writeVersionInfo() {
  const versionFile = join(RUNTIME_DIR, "mlx-version.json");
  const info = {
    installedAt: new Date().toISOString(),
    versions: PINNED_VERSIONS,
    venvPath: MLX_VENV_DIR
  };
  writeFileSync(versionFile, JSON.stringify(info, null, 2) + "\n");
  console.log(`Wrote version info to ${versionFile}`);
}

function main() {
  console.log("Installing MLX-Audio runtime for TurnSpeak...\n");

  ensureDir(RUNTIME_DIR);
  writeRequirements();
  createVenv();
  installPackages();
  verifyInstallation();
  writeVersionInfo();

  console.log("\n✅ MLX-Audio runtime installed successfully!");
  console.log(`   Venv: ${MLX_VENV_DIR}`);
  console.log(`   Python: ${join(MLX_VENV_DIR, "bin", "python")}`);
  console.log("\nNext steps:");
  console.log("  1. Download models using local-agents downloader");
  console.log("  2. Run worker: node scripts/mlx-worker.mjs");
  console.log("  3. Test: turn-speak latest --provider mlx --model kokoro");
}

main().catch((error) => {
  console.error(`\n❌ Installation failed: ${error.message}`);
  process.exit(1);
});