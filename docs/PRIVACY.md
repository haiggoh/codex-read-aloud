# Privacy

Claude TurnSpeak is local-first.

## What It Reads

- In Codex, it can read the newest assistant message from local Codex session JSONL files when you run `scripts/speak-latest-codex.mjs`.
- In Claude Code, it can speak text the agent explicitly passes to `scripts/speak-text.mjs`, or read the newest completed main-agent text response from Claude Code's existing local transcript when you explicitly run `speak-last` or `turn-speak latest`.
- **Claude latest-response mode registers no hook and creates no duplicate response cache.**
- It cleans Markdown before speech and omits fenced code blocks by default.
- Only main-agent responses are read; subagent/sidechain output is excluded.

## What Leaves Your Machine

### Default Path (macOS Provider)
**Nothing leaves your machine.**
- Uses built-in macOS `say` command
- Text passed via stdin (not process arguments)
- No network connections

### MLX Provider (Local Neural TTS)
**Nothing leaves your machine during playback.**
- Models loaded from `~/.models/` (pre-downloaded explicitly)
- MLX worker runs locally via Unix domain socket
- No Hugging Face Hub calls during inference
- **Model downloads are explicit and one-time only** — never during playback

### OpenAI Provider (Optional)
- Text being spoken is sent to OpenAI's TTS API
- Requires explicit opt-in and API key setup
- OpenAI API key read from `OPENAI_API_KEY` or macOS Keychain

## Default Privacy Guarantees

| Guarantee | Status |
|-----------|--------|
| No cloud TTS in default path | ✅ |
| No telemetry | ✅ |
| No automatic speech | ✅ |
| No passive duplicate response store | ✅ |
| No response text in process arguments | ✅ (stdin for `say`) |
| No broad process-name killing | ✅ |
| Temporary audio removed after playback | ✅ |
| Routine playback works with networking disabled | ✅ (after model download) |
| Model downloads are explicit, never silent | ✅ |

## Secrets

The recommended API key setup stores your key in macOS Keychain:

```bash
node scripts/store-openai-key.mjs
```

The key is **not** written to:
- The plugin repo
- Codex config
- Claude Code settings
- Session logs
- Runtime config file

## Telemetry

This plugin does not collect telemetry.

## Verifying Offline Behavior

```bash
# Disable network
sudo /usr/sbin/networksetup -setairportpower en0 off

# Test macOS provider (always works)
turn-speak latest --provider macos

# Test MLX provider (works if model downloaded)
turn-speak latest --provider mlx --model kokoro

# Re-enable network
sudo /usr/sbin/networksetup -setairportpower en0 on
```

See [OFFLINE.md](OFFLINE.md) for detailed verification.