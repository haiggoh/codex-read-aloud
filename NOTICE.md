# NOTICE

## Upstream Attribution

This product includes software derived from **codex-read-aloud** by Cobi Bean.

- **Upstream repository**: https://github.com/cobibean/codex-read-aloud
- **Upstream license**: MIT
- **Source commit**: e758794b1981fb3cf83d6a63d7e12dd1851fe470 (PR #1: "feat(claude): add on-demand latest-response readback")
- **Fork repository**: https://github.com/haiggoh/codex-read-aloud

## Major Modifications

Claude TurnSpeak diverges from upstream in the following ways:

### Product Identity
- **Product name**: Claude TurnSpeak (vs. Codex Read Aloud)
- **Primary command**: `speak-last` / `turn-speak` (vs. `speak-latest-claude.mjs`)
- **Branding**: TurnSpeak-specific documentation, launchers, and CLI

### Architecture
- **Hookless transcript adapter** (preserved from PR #1)
- **Persistent MLX-Audio worker** for local neural TTS
- **Project/session selectors** for concurrent session control
- **Markdown-aware speech preparation** with chunking
- **Stable CLI wrappers** in `~/bin` (survive plugin updates)

### Provider System
- **macOS `say`** via stdin (privacy: text not in process args)
- **MLX local neural TTS** (Kokoro, Qwen3, Chatterbox models)
- **OpenAI TTS** (optional, requires API key)
- **No cloud TTS in default path**

### Privacy Guarantees
- No automatic speech
- No hooks by default
- No passive response cache
- No telemetry
- Response text not in process arguments (stdin for `say`)
- Offline playback after model download

### Local Model Catalogue
- Pinned model snapshots in `acquisition/model-catalog.turn-speak-tts.psv`
- Four candidates: Kokoro, Qwen3-TTS (0.6B/1.7B), Chatterbox
- Downloaded explicitly via free-agents downloader
- No silent downloads during playback

## License

MIT License - see LICENSE file.

The original MIT license from codex-read-aloud is preserved. This NOTICE file is added per the fork attribution requirements.