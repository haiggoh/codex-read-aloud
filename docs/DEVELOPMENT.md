# TurnSpeak Development Guide

## Architecture Overview

```
turn-speak (CLI wrapper in ~/bin)
    ↓
turn-speak.mjs (main CLI logic)
    ↓
┌─────────────────────────────────────────┐
│  Transcript Adapter (claude-sessions)   │
│  - Project/session filtering            │
│  - Completed turn extraction            │
│  - Concurrent session semantics         │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│  Speech Preparation (read-aloud)        │
│  - Markdown normalization               │
│  - Code block omission                  │
│  - Chunking (paragraph/sentence)        │
└─────────────────────────────────────────┘
    ↓
┌─────────────────┬───────────────────────┐
│  macOS Provider │  MLX Provider         │
│  say (stdin)    │  Unix socket → Worker │
└─────────────────┴───────────────────────┘
                      ↓
              ┌───────────────────┐
              │  MLX Worker       │
              │  (persistent)     │
              │  - Kokoro         │
              │  - Qwen3 (future) │
              │  - Chatterbox     │
              └───────────────────┘
```

## Key Components

### `scripts/lib/claude-sessions.mjs`
- `findLatestClaudeSessionFile()` - finds newest transcript by mtime
- `getLatestClaudeAssistantMessage()` - extracts completed main-agent prose
- `findLatestClaudeAssistantMessage()` - high-level with retry
- `diagnoseLatestClaudeSession()` - diagnostics for debugging

### `scripts/lib/read-aloud.mjs`
- `prepareSpeechText()` - Markdown → speech text
- `chunkText()` - long text splitting
- `speakWithMacOS()` - macOS `say` via stdin
- `speakWithOpenAI()` - OpenAI TTS (optional)

### `scripts/mlx-worker.mjs`
- Persistent Unix domain socket server
- Spawns Python worker for MLX inference
- Keeps models warm in memory
- Handles: health, load, speak, stop, status, shutdown

### `scripts/lib/mlx-client.mjs`
- Node.js client for MLX worker
- JSON Lines protocol over Unix socket
- Auto-reconnect, timeout handling

### `scripts/turn-speak.mjs`
- Main CLI entry point
- Subcommands: latest, stop, --version, --help
- Provider routing (macos/mlx/openai)

## Development Workflow

### Running Tests
```bash
# All tests
npm test

# Specific test file
node --test test/claude-sessions-extended.test.mjs

# Watch mode (requires nodemon)
nodemon --exec "npm test"
```

### Testing MLX Worker
```bash
# Start worker
node scripts/mlx-worker.mjs &

# Test client
node -e "
import { MLXClient } from './scripts/lib/mlx-client.mjs';
const c = new MLXClient();
console.log(await c.health());
console.log(await c.loadModel('kokoro', '~/.models/Kokoro-82M-bf16'));
console.log(await c.speak('Hello', { model: 'kokoro' }));
"

# Stop worker
kill %1
```

### Testing macOS Provider
```bash
# Dry run (no audio)
CODEX_READ_ALOUD_DRY_RUN=1 node scripts/speak-text.mjs "test"

# Live test
node scripts/speak-text.mjs "Hello world"
```

### Debugging Transcript Selection
```bash
# With diagnostics
turn-speak latest --diagnose

# Custom projects dir
turn-speak latest --projects-dir /custom/path --project my-project --diagnose

# Specific session
turn-speak latest --session <session-id> --diagnose
```

## Adding a New MLX Model

1. **Add to model catalogue** (`acquisition/model-catalog.turn-speak-tts.psv`)
2. **Download model** (free-agents downloader)
3. **Add loader in `mlx-worker.mjs`**:
   ```python
   def load_newmodel(model_path):
       if "newmodel" not in loaded_models:
           # Model-specific loading logic
           loaded_models["newmodel"] = ...
       return loaded_models["newmodel"]
   
   def generate_newmodel(model, text, voice, speed):
       # Model-specific generation
       return audio
   ```
4. **Add to `handle_request`** in worker script
5. **Add to model config in `turn-speak.mjs`**:
   ```javascript
   const modelPaths = {
     newmodel: "~/.models/New-Model-Path",
     ...
   };
   ```
6. **Test**: `turn-speak latest --provider mlx --model newmodel`

## Plugin Structure

```
.claude-plugin/
  plugin.json          # Plugin metadata
  marketplace.json     # Marketplace config
skills/
  codex-read-aloud/
    SKILL.md          # Skill definition
scripts/
  *.mjs               # All executable scripts
  lib/                # Shared libraries
test/
  *.test.mjs          # Unit tests
  fixtures/           # Test transcript fixtures
docs/
  *.md                # Documentation
acquisition/
  model-catalog.turn-speak-tts.psv  # Pinned model catalogue
```

## Version Bumping

Version must be updated in 3 places:
1. `package.json`
2. `.claude-plugin/plugin.json`
3. `.claude-plugin/marketplace.json`

Then:
```bash
git commit -am "chore: release vX.Y.Z"
git tag -a vX.Y.Z -m "TurnSpeak vX.Y.Z"
git push origin feature/claude-turn-speak-product --tags
```

## Release Checklist

See main plan document §14 for complete release gates.

## Debugging Tips

### Worker Won't Start
```bash
# Check Python venv
~/.turn-speak/runtime/mlx-audio/bin/python -c "import mlx_audio"

# Check socket permissions
ls -la ~/.turn-speak/runtime/worker.sock

# Check for port conflicts (shouldn't happen with Unix socket)
```

### Model Load Fails
```bash
# Verify model path
ls -la ~/.models/Kokoro-82M-bf16/

# Test Python imports
~/.turn-speak/runtime/mlx-audio/bin/python -c "
from mlx_audio.tts.models.kokoro import KokoroPipeline
from mlx_audio.tts.utils import load_model
model = load_model('~/.models/Kokoro-82M-bf16')
p = KokoroPipeline(lang_code='a', model=model, repo_id='mlx-community/Kokoro-82M-bf16')
print('OK')
"
```

### Audio Playback Issues
```bash
# Check afplay
afplay /path/to/test.wav

# Check say
say -f /dev/stdin <<< "test"
```