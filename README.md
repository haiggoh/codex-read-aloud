# Claude TurnSpeak

Read Claude Code replies aloud on demand on macOS.

Claude TurnSpeak is for people who can dictate prompts but want the agent to speak back when asked. It does not auto-read every chat. It uses built-in macOS voices by default and can use local neural TTS (MLX-Audio) or OpenAI TTS for a more natural voice.

This plugin is intentionally **on-demand by default**. Installing it does not register Claude hooks, change Codex `notify`, or make every chat start talking.

## Requirements

- macOS (Apple Silicon)
- Node.js 20+
- Claude Code installed
- OpenAI API key optional; only needed for OpenAI TTS

## Quick Start

### From Local Clone (Recommended)

```bash
git clone https://github.com/haiggoh/claude-turn-speak.git ~/ClaudeWorkspace/claude-turn-speak
cd ~/ClaudeWorkspace/claude-turn-speak
node scripts/setup.mjs auto
```

This installs the plugin and creates stable CLI wrappers:
- `speak-last` — read newest completed Claude response
- `turn-speak` — extended CLI with project/session selection

### From GitHub (After Publication)

```bash
claude plugin marketplace add haiggoh/claude-turn-speak
claude plugin install claude-turn-speak@claude-turn-speak
```

Then invoke in chat:

```text
Use TurnSpeak to read that answer aloud.
```

### Optional Test

```bash
speak-last
# or
turn-speak latest
```

To stop playback while it is talking:

```bash
turn-speak stop
```

For a non-terminal stop button on macOS:

```bash
node scripts/install-launcher-apps.mjs
```

That creates:
- `~/Applications/Speak Last Claude Turn.app` — reads last response
- `~/Applications/Stop Claude TurnSpeak.app` — stops playback

Both work from Spotlight, Raycast, Alfred, or launcher hotkeys.

## High Quality Local Voice (MLX)

The default uses your system-selected macOS voice and needs no API key. For a more natural local voice, install MLX-Audio and download models:

```bash
# One-time MLX runtime setup
node scripts/install-mlx-runtime.mjs

# Download models (requires free-agents repo)
~/ClaudeWorkspace/free-agents/install/download-models.sh \
  --catalog ~/ClaudeWorkspace/claude-turn-speak/acquisition/model-catalog.turn-speak-tts.psv \
  --select tts-kokoro-82m-bf16 \
  --select tts-qwen3-06b-custom-8bit \
  --select tts-qwen3-17b-custom-bf16 \
  --select tts-chatterbox-turbo-8bit
```

Then use:

```bash
turn-speak latest --provider mlx --model kokoro --voice af_heart
```

See [docs/MODELS.md](docs/MODELS.md) for hardware requirements per model.

## OpenAI TTS (Optional)

For cloud TTS, store your OpenAI API key in macOS Keychain:

```bash
node scripts/store-openai-key.mjs
node scripts/set-quality.mjs openai-natural
```

The key is stored in Keychain under `claude-turn-speak-openai-api-key`. It is not written to this repo, Codex config, Claude settings, or a `.env` file.

## Use With Claude Code

Claude setup installs and enables the plugin so Claude can use its skill/instructions. It does not install a `Stop` hook, so Claude will not read every response automatically. Ask Claude to use TurnSpeak when you want speech.

Example:

```text
Use TurnSpeak to read that answer aloud.
```

For the explicit latest-response workflow:

```bash
speak-last
# or
turn-speak latest
```

This reads the newest completed main-agent text response from Claude Code's existing local transcript. It registers no hook, creates no response cache, and does not require another Claude turn.

## Commands

```bash
# Install for whichever agent CLIs are present.
node scripts/setup.mjs auto

# Install only one integration.
node scripts/setup.mjs codex
node scripts/setup.mjs claude

# Speak text on demand.
node scripts/speak-text.mjs "Text to read aloud"

# Speak the latest local Codex assistant message on demand.
node scripts/speak-latest-codex.mjs

# Speak the latest local Claude Code assistant message on demand.
speak-last
# or
turn-speak latest

# Extended CLI with options.
turn-speak latest --project "$PWD" --diagnose
turn-speak latest --provider mlx --model kokoro --voice af_heart
turn-speak latest --session <id>
turn-speak stop

# Install macOS launcher apps.
node scripts/install-launcher-apps.mjs

# Check setup.
node scripts/doctor.mjs

# Run public tests.
npm test

# Run maintainer validation when Codex and Claude validators are installed.
npm run validate:maintainer
```

## Configuration

Runtime settings live at:

```text
~/Library/Application Support/codex-read-aloud/config.json
```

Default settings:

```json
{
  "provider": "macos",
  "voice": "system",
  "voicePreference": [
    "Shelley (English (US))",
    "Sandy (English (US))",
    "Flo (English (US))",
    "Reed (English (US))",
    "Samantha",
    "Alex"
  ],
  "rate": null,
  "speakMode": "final",
  "maxCharacters": 3000,
  "includeCodeBlocks": false,
  "stopPrevious": true
}
```

### Provider Options

- `provider: "macos"` — built-in macOS `say` command (default). Text passed via stdin for privacy.
- `provider: "mlx"` — local MLX-Audio neural TTS (requires `install-mlx-runtime.mjs` and models)
- `provider: "openai"` — OpenAI TTS (requires API key)

### Voice Options

- `voice: "system"` — uses your selected macOS system voice
- `voice: "auto"` — picks first available from `voicePreference`
- `voice: "Shelley (English (US))"` — explicit voice name

### MLX Model Options

- `--model kokoro` — Kokoro 82M BF16 (fast, ~450 MB RAM)
- `--model qwen3-06b` — Qwen3-TTS 0.6B 8-bit (balanced, ~1.8 GB RAM)
- `--model qwen3-17b` — Qwen3-TTS 1.7B BF16 (quality, ~4.2 GB RAM)
- `--model chatterbox` — Chatterbox Turbo 8-bit (expressive, ~900 MB RAM)

### Other Settings

- `maxCharacters` — truncate long responses (default 3000)
- `includeCodeBlocks` — speak fenced code blocks (default false)
- `stopPrevious` — stop prior playback before new (default true)

## Presets

```bash
node scripts/set-quality.mjs macos-modern   # free, local, system Apple voice
node scripts/set-quality.mjs macos-auto     # free, local, tries newer voices
node scripts/set-quality.mjs macos-calm     # free, local, alternate voice
node scripts/set-quality.mjs macos-bright   # free, local, faster/clearer
node scripts/set-quality.mjs openai-natural # best OpenAI TTS preset
node scripts/set-quality.mjs openai-calm    # slower OpenAI TTS preset
```

## Agent Invocation

After installation, invoke in chat with:

```text
Use TurnSpeak to read your answer aloud.
```

Agents should run:
- `node scripts/speak-text.mjs` with text to speak
- `speak-last` or `turn-speak latest` for newest Claude response
- `turn-speak latest --provider mlx --model kokoro` for local neural TTS

To stop playback:

```bash
turn-speak stop
```

## Documentation

- [Privacy](docs/PRIVACY.md) — What data is read, what leaves your machine
- [Offline Playback](docs/OFFLINE.md) — Network-disabled verification
- [Models](docs/MODELS.md) — Hardware requirements per model
- [Tournament Results](docs/TOURNAMENT_RESULTS.md) — Model selection rationale
- [Development](docs/DEVELOPMENT.md) — Architecture and contribution guide

## Privacy

See [docs/PRIVACY.md](docs/PRIVACY.md).

Key guarantees:
- No cloud TTS in default path
- No telemetry
- No automatic speech
- No hooks by default
- No passive response cache
- Response text not in process arguments (stdin for `say`)
- Works offline after model download

## Upstream

This is a product fork of [codex-read-aloud](https://github.com/cobibean/codex-read-aloud) (MIT). The upstream-compatible changes are in branch `feature/native-claude-latest-readback` and submitted as PR #1. See [NOTICE.md](NOTICE.md) for attribution.

## Notes

This is on-demand read aloud, not streaming speech. It reads the local transcript only when you run the command.