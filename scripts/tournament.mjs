#!/usr/bin/env node
/**
 * TurnSpeak Tournament Measurement Harness
 * Runs fixed-corpus evaluation across all providers/models
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const CORPUS_PATH = join(process.cwd(), "test", "corpus", "turn-speak-corpus.json");
const OUTPUT_DIR = join(process.cwd(), "docs", "tournament-audio");
const RESULTS_PATH = join(process.cwd(), "docs", "TOURNAMENT_RESULTS.json");

const MODELS = [
  { id: "macos-shelley", name: "macOS Shelley", provider: "macos", model: null, voice: "Shelley (English (US))" },
  { id: "kokoro", name: "Kokoro 82M BF16", provider: "mlx", model: "kokoro", voice: "af_heart" },
  { id: "qwen3-06b", name: "Qwen3-TTS 0.6B 8-bit", provider: "mlx", model: "qwen3-06b", voice: "serena" },
  { id: "qwen3-17b", name: "Qwen3-TTS 1.7B BF16", provider: "mlx", model: "qwen3-17b", voice: "serena" },
  { id: "chatterbox", name: "Chatterbox Turbo 8-bit", provider: "mlx", model: "chatterbox", voice: "default" }
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...options, encoding: "utf8" });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => stdout += d);
    child.stderr.on("data", d => stderr += d);
    child.on("close", code => resolve({ code, stdout, stderr }));
    child.on("error", reject);
  });
}

async function generateAudio(model, corpusItem) {
  const outputFile = join(OUTPUT_DIR, `${model.id}_${corpusItem.id}.wav`);

  if (existsSync(outputFile)) {
    console.log(`  Skipping ${model.id}_${corpusItem.id}.wav (exists)`);
    return { outputFile, cached: true };
  }

  console.log(`  Generating ${model.id}_${corpusItem.id}.wav`);

  if (model.provider === "macos") {
    // say doesn't support -o with -f /dev/stdin, so use temp file approach
    const tmpInput = join("/tmp", `turnspeak_input_${Date.now()}.txt`);
    writeFileSync(tmpInput, corpusItem.text);

    const result = await runCommand("say", ["-v", model.voice, "-f", tmpInput, "-o", outputFile, "--data-format=LEF32@22050"]);
    // Clean up temp input
    try { require("node:fs").unlinkSync(tmpInput); } catch {}

    if (result.code !== 0) {
      throw new Error(`say failed: ${result.stderr}`);
    }
  } else {
    // For MLX models, use MLX client (requires worker running)
    const { MLXClient } = await import("./lib/mlx-client.mjs");
    const client = new MLXClient();

    try {
      // Health check
      const health = await client.health();
      if (!health.ok) {
        throw new Error("MLX worker not healthy");
      }

      // Load model if needed
      const modelPaths = {
        kokoro: "~/.models/Kokoro-82M-bf16",
        "qwen3-06b": "~/.models/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit",
        "qwen3-17b": "~/.models/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16",
        chatterbox: "~/.models/chatterbox-turbo-8bit"
      };
      const modelPath = modelPaths[model.model];
      if (modelPath) {
        await client.loadModel(model.model, modelPath);
      }

      // Speak
      const speakResponse = await client.speak(corpusItem.text, {
        model: model.model,
        voice: model.voice,
        speed: 1.0
      });

      if (!speakResponse.ok) {
        throw new Error(speakResponse.error || "MLX speak failed");
      }

      // Copy audio file to output location
      const { copyFileSync } = await import("node:fs");
      copyFileSync(speakResponse.audio_path, outputFile);

    } catch (e) {
      throw new Error(`MLX generation failed: ${e.message}`);
    }
  }

  return { outputFile, cached: false };
}

async function runTournament() {
  console.log("🎯 TurnSpeak Tournament Measurement Harness");
  console.log("============================================\n");

  // Load corpus
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));
  console.log(`Loaded ${corpus.length} corpus items across categories:`);

  const categories = [...new Set(corpus.map(c => c.category))];
  categories.forEach(cat => {
    const count = corpus.filter(c => c.category === cat).length;
    console.log(`  ${cat}: ${count} items`);
  });

  // Create output directory
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // For each model, generate audio for all corpus items
  const results = [];

  for (const model of MODELS) {
    console.log(`\n📊 Testing ${model.name} (${model.id})...`);

    const modelResults = {
      model: model.id,
      name: model.name,
      provider: model.provider,
      items: []
    };

    for (const item of corpus) {
      console.log(`  ${item.id} (${item.category})...`);

      const startTime = Date.now();
      try {
        const result = await generateAudio(model, item);
        const duration = Date.now() - startTime;

        modelResults.items.push({
          corpusId: item.id,
          category: item.category,
          outputFile: result.outputFile,
          durationMs: duration,
          cached: result.cached,
          skipped: result.skipped
        });
      } catch (e) {
        console.log(`  ❌ Failed: ${e.message}`);
        modelResults.items.push({
          corpusId: item.id,
          category: item.category,
          error: e.message,
          durationMs: Date.now() - startTime
        });
      }
    }

    results.push(modelResults);
  }

  // Save results
  writeFileSync(RESULTS_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    corpusVersion: "1.0",
    models: results
  }, null, 2));

  console.log(`\n✅ Tournament generation complete. Results saved to ${RESULTS_PATH}`);
  console.log(`Audio files in ${OUTPUT_DIR}/`);
  console.log("\nNext steps:");
  console.log("1. Listen to audio files blindly (randomized order)");
  console.log("2. Rate each sample on naturalness, technical accuracy, fatigue");
  console.log("3. Enter scores into a CSV or JSON");
  console.log("4. Run analysis to compute weighted scores");
}

async function analyzeResults() {
  if (!existsSync(RESULTS_PATH)) {
    console.error("No results found. Run generation first.");
    return;
  }

  const results = JSON.parse(readFileSync(RESULTS_PATH, "utf8"));
  console.log("📈 Tournament Analysis");
  console.log("======================\n");

  // Summary table
  console.log("\nModel Summary:");
  console.log("--------------");
  for (const model of results.models) {
    const successful = model.items.filter(i => !i.error && !i.skipped).length;
    const total = model.items.length;
    console.log(`${model.name}: ${successful}/${total} generated`);
  }

  console.log("\nNote: Subjective evaluation requires human listening.");
  console.log("Use the blind listening protocol documented in TOURNAMENT_RESULTS.md");
}

function printUsage() {
  console.log(`TurnSpeak Tournament Harness

Usage:
  node scripts/tournament.mjs generate    Generate audio for all models × corpus
  node scripts/tournament.mjs analyze     Analyze generated results
  node scripts/tournament.mjs help        Show this help

Files:
  Corpus: ${CORPUS_PATH}
  Audio output: ${OUTPUT_DIR}/
  Results: ${RESULTS_PATH}
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "help") {
    printUsage();
    return;
  }

  if (args[0] === "generate") {
    await runTournament();
  } else if (args[0] === "analyze") {
    await analyzeResults();
  } else {
    console.error(`Unknown command: ${args[0]}`);
    printUsage();
    process.exit(1);
  }
}

main().catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});