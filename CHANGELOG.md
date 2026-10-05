# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-10-05

### Changed
- **Skill description**: Updated `speak-latest-claude.mjs` description to clarify it reads **completed** Claude Code turns from transcript (written after each turn completes), not in-progress turns
- **AGENTS.md**: Added note explaining transcript is written after turn completion

## [0.2.0] - 2026-10-04

### Added
- **Product rebrand**: Renamed from "Codex Read Aloud" to "Claude TurnSpeak" with dedicated CLI commands
- **Stable CLI wrappers**: `speak-last` and `turn-speak` installed to `~/bin` (survive plugin updates)
- **Extended CLI**: `turn-speak` with subcommands (`latest`, `stop`) and options (`--project`, `--session`, `--diagnose`, `--provider`, `--model`, `--voice`)
- **Project/session selectors**: Filter transcript search by project directory name or session ID
- **Diagnostics mode**: `--diagnose` flag shows selection reasoning (file, line, sessionId, timestamp)
- **MLX-Audio local neural TTS**: Persistent Unix socket worker with model warming
  - Kokoro 82M BF16 (fast, ~450 MB RAM)
  - Qwen3-TTS 0.6B 8-bit (balanced, ~1.8 GB RAM)
  - Qwen3-TTS 1.7B BF16 (quality, ~4.2 GB RAM)
  - Chatterbox Turbo 8-bit (expressive, ~900 MB RAM)
- **MLX runtime installer**: `scripts/install-mlx-runtime.mjs` pins MLX-Audio 0.5.7 + dependencies
- **macOS launcher apps**: `Speak Last Claude Turn.app` and `Stop Claude TurnSpeak.app` (LSUIElement, Spotlight/Raycast/Alfred compatible)
- **Privacy improvement**: macOS `say` now uses stdin instead of command-line arguments (text not in process args)
- **Offline playback verification**: Works with networking disabled after model download
- **Tournament framework**: Fixed-corpus measurement harness for empirical model selection
- **Documentation overhaul**: README, PRIVACY, OFFLINE, MODELS, TOURNAMENT_RESULTS, DEVELOPMENT, NOTICE

### Changed
- **Plugin name**: `codex-read-aloud` → `claude-turn-speak` (package.json, plugin.json, marketplace.json)
- **Package name**: `codex-read-aloud` → `claude-turn-speak` in package.json
- **Default provider**: Remains macOS `say` (accessible on all Apple Silicon); MLX is opt-in
- **Transcript adapter**: Added project/session filtering, concurrent session semantics documented
- **Speech preparation**: Added Markdown table, horizontal rule, bold/italic, numbered list handling
- **Chunking**: Added `chunkText()` with paragraph/sentence/clause boundary detection and overlap

### Fixed
- **Process argument privacy**: macOS `say` uses `-f /dev/stdin` instead of passing text as argument
- **Worker socket cleanup**: Proper Unix domain socket cleanup on shutdown
- **Model loading**: Dynamic model loading with proper voice handling per model

### Security
- No automatic speech, no hooks by default, no passive response cache
- Response text never in process arguments (stdin for say)
- No telemetry, no cloud TTS in default path
- Model downloads explicit and one-time only

## [0.1.7] - 2026-09-XX

### Added
- Initial Codex Read Aloud implementation
- Hookless transcript readback for Claude Code
- macOS say and OpenAI TTS providers
- Basic transcript adapter with sidechain exclusion
- Codex integration support

[0.2.0]: https://github.com/haiggoh/codex-read-aloud/compare/v0.1.7...v0.2.0
[0.1.7]: https://github.com/haiggoh/codex-read-aloud/releases/tag/v0.1.7
