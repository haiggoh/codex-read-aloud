# Offline Playback Verification

TurnSpeak's core privacy guarantee: **replaying an already-generated response requires no additional Claude inference or network speech service.**

## Verified Offline Behavior

### macOS Provider (Default)
- ✅ Works with networking completely disabled
- Uses built-in `say` command
- No network calls whatsoever
- Verified: `sudo /usr/sbin/networksetup -setairportpower en0 off`

### MLX Provider (Local Neural TTS)
- ✅ Works with networking disabled **after model download**
- Requires models pre-downloaded to `~/.models/`
- MLX worker loads models from local paths only
- No Hugging Face Hub calls during playback
- Verified: model loads from `~/.models/Kokoro-82M-bf16`, generates audio locally

### OpenAI Provider
- ❌ Requires network connectivity
- Sends text to OpenAI TTS API
- Falls back to macOS provider if network unavailable

## Testing Offline Playback

```bash
# Disable WiFi
sudo /usr/sbin/networksetup -setairportpower en0 off

# Test macOS provider (always works offline)
turn-speak latest --provider macos

# Test MLX provider (works if model downloaded)
turn-speak latest --provider mlx --model kokoro --voice af_heart

# Re-enable WiFi
sudo /usr/sbin/networksetup -setairportpower en0 on
```

## What Does NOT Leave Your Machine (Default Path)

| Data | macOS Provider | MLX Provider |
|------|---------------|--------------|
| Response text | No | No |
| Audio output | No (local playback) | No (local playback) |
| Telemetry | No | No |
| API keys | N/A | N/A |
| Model weights | N/A | Pre-downloaded only |

## Model Downloads (One-Time, Explicit)

Models are **never downloaded during playback**. They must be explicitly acquired:

```bash
# Using local-agents downloader (from free-agents repo)
~/ClaudeWorkspace/free-agents/install/download-models.sh \
  --catalog ~/ClaudeWorkspace/claude-turn-speak/acquisition/model-catalog.turn-speak-tts.psv \
  --select tts-kokoro-82m-bf16 \
  --select tts-qwen3-06b-custom-8bit \
  --select tts-qwen3-17b-custom-bf16 \
  --select tts-chatterbox-turbo-8bit
```

## Privacy Architecture

```
User invokes turn-speak
       ↓
Claude transcript (local JSONL)
       ↓
Text extraction & cleanup (local)
       ↓
┌─────────────────────┬─────────────────────┐
│ macOS Provider      │ MLX Provider        │
│   say (stdin)       │ Local MLX worker    │
│   No network        │ Unix socket IPC     │
│   No temp files*    │ Local model files   │
└─────────────────────┴─────────────────────┘
       ↓
Local audio playback (afplay/say)
       ↓
Temp audio cleaned up after playback
```

*macOS `say` with stdin creates no temporary files.

## Verification Commands

```bash
# Check no network connections during playback
lsof -i -p $(pgrep -f "say|afplay|python.*mlx")  # Should show no connections

# Verify MLX worker loads from local path
turn-speak latest --provider mlx --model kokoro --diagnose 2>&1 | grep "model_path"

# Verify temp audio cleanup
ls /tmp/turn-speak-*.wav /tmp/codex-read-aloud-*.mp3 2>/dev/null || echo "No temp files (cleaned up)"
```