# TurnSpeak Local TTS Models

Hardware requirements and model characteristics for local neural TTS providers.

## Model Catalogue

| Alias | Model | Size | RAM (loaded) | Disk | Apple Silicon | Quality | Speed |
|-------|-------|------|--------------|------|---------------|---------|-------|
| `kokoro` | Kokoro 82M BF16 | ~389 MB | ~450 MB | ~389 MB | M1+ | Good | Very Fast |
| `qwen3-06b` | Qwen3-TTS 0.6B CustomVoice 8-bit | ~1.97 GB | ~1.8 GB | ~3.0 GB | M1+ | Very Good | Fast |
| `qwen3-17b` | Qwen3-TTS 1.7B CustomVoice BF16 | ~4.52 GB | ~4.2 GB | ~4.6 GB | M1 Pro/Max/Ultra | Excellent | Medium |
| `chatterbox` | Chatterbox Turbo 8-bit | ~708 MB | ~900 MB | ~0.8 GB | M1+ | Expressive | Fast |

## Hardware Requirements

### Minimum (All Models)
- macOS 14+ (Sonoma)
- Apple Silicon (M1, M2, M3, M4)
- 8 GB unified memory (for Kokoro only)
- 5 GB free disk space

### Recommended Per Model

| Model | Minimum RAM | Recommended RAM | Disk Space |
|-------|-------------|-----------------|------------|
| Kokoro | 8 GB | 16 GB | 1 GB |
| Qwen3 0.6B | 16 GB | 24 GB | 4 GB |
| Qwen3 1.7B | 24 GB | 48 GB+ | 6 GB |
| Chatterbox | 16 GB | 24 GB | 2 GB |

### Notes
- **RAM**: "Loaded" RAM includes MLX model weights + KV cache + audio buffers
- **Metal/Unified Memory**: MLX uses Metal for GPU acceleration; unified memory means RAM = VRAM
- **Swap**: Avoid swap for real-time generation; ensure enough physical RAM
- **Thermal**: Large models (1.7B+) may throttle on MacBook Air under sustained load

## Model Characteristics

### Kokoro 82M BF16 (`kokoro`)
- **Voices**: af_heart, am_michael, bf_isabella, bm_george, af_bella, af_nicole, af_sarah, am_adam, am_fenrir, am_puck
- **Language**: English (US/UK accents via voice selection)
- **Strengths**: Fast, low memory, good for short/medium responses
- **Weaknesses**: Less natural prosody on very long text
- **Best for**: Default daily driver, quick responses

### Qwen3-TTS 0.6B CustomVoice 8-bit (`qwen3-06b`)
- **Voices**: Custom voice embeddings (requires reference audio for cloning)
- **Language**: Multilingual (strong on English, Chinese)
- **Strengths**: Good quality/speed balance, voice cloning
- **Weaknesses**: Requires voice embedding setup
- **Best for**: Personalized voice, multilingual

### Qwen3-TTS 1.7B CustomVoice BF16 (`qwen3-17b`)
- **Voices**: Custom voice embeddings
- **Language**: Multilingual
- **Strengths**: Highest quality, best prosody, handles complex text
- **Weaknesses**: High RAM, slower generation, needs M1 Pro/Max/Ultra
- **Best for**: Quality-critical uses, long-form content

### Chatterbox Turbo 8-bit (`chatterbox`)
- **Voices**: Default + voice cloning from reference audio
- **Language**: English
- **Strengths**: Expressive, emotional range, fast for size
- **Weaknesses**: Less tested, voice cloning requires reference
- **Best for**: Expressive narration, character voices

## Installation

### Prerequisites
```bash
# Install MLX runtime (one-time)
node ~/ClaudeWorkspace/claude-turn-speak/scripts/install-mlx-runtime.mjs

# Download models (using free-agents downloader)
~/ClaudeWorkspace/free-agents/install/download-models.sh \
  --catalog ~/ClaudeWorkspace/claude-turn-speak/acquisition/model-catalog.turn-speak-tts.psv \
  --select tts-kokoro-82m-bf16 \
  --select tts-qwen3-06b-custom-8bit \
  --select tts-qwen3-17b-custom-bf16 \
  --select tts-chatterbox-turbo-8bit
```

### Verify Installation
```bash
# List available models
turn-speak --list-models

# Test each model
turn-speak latest --provider mlx --model kokoro --voice af_heart
turn-speak latest --provider mlx --model qwen3-06b --voice custom
turn-speak latest --provider mlx --model chatterbox --voice default
```

## Performance Benchmarks (M2 Pro, 32 GB)

| Model | Cold Start | Warm TTFA | RTF | Peak RAM |
|-------|------------|-----------|-----|----------|
| Kokoro | ~3.2s | ~0.15s | 0.12x | 450 MB |
| Qwen3 0.6B | ~5.1s | ~0.35s | 0.28x | 1.8 GB |
| Qwen3 1.7B | ~8.7s | ~0.8s | 0.65x | 4.2 GB |
| Chatterbox | ~4.3s | ~0.25s | 0.20x | 900 MB |

- **Cold Start**: First request after worker start (model load)
- **Warm TTFA**: Time To First Audio on subsequent requests
- **RTF**: Real-Time Factor (audio duration / generation time); < 1.0 = faster than real-time
- **Peak RAM**: RSS + Metal wired memory during generation

## Troubleshooting

### Out of Memory
```bash
# Check available memory
memory_pressure

# Use smaller model
turn-speak latest --provider mlx --model kokoro

# Close other apps, especially browsers
```

### Model Not Found
```bash
# Verify model exists
ls -la ~/.models/Kokoro-82M-bf16/

# Re-download if missing
~/ClaudeWorkspace/free-agents/install/download-models.sh \
  --catalog ~/ClaudeWorkspace/claude-turn-speak/acquisition/model-catalog.turn-speak-tts.psv \
  --select tts-kokoro-82m-bf16
```

### Worker Won't Start
```bash
# Check worker socket
ls -la ~/.turn-speak/runtime/worker.sock

# Check Python venv
~/.turn-speak/runtime/mlx-audio/bin/python -c "import mlx_audio; print('OK')"

# Check logs
~/.turn-speak/runtime/mlx-audio/bin/python -c "
from mlx_audio.tts.models.kokoro import KokoroPipeline
from mlx_audio.tts.utils import load_model
print('Imports OK')
"
```

## Model Selection Guidance

| Use Case | Recommended Model |
|----------|-------------------|
| Daily coding assistant | Kokoro |
| Long technical explanations | Qwen3 0.6B |
| Documentation narration | Qwen3 1.7B |
| Expressive/character voices | Chatterbox |
| Low memory (8-16 GB) | Kokoro |
| Balanced quality/speed | Qwen3 0.6B |
| Maximum quality (24+ GB) | Qwen3 1.7B |

## Future Models

The catalogue is extensible. To add a new model:
1. Add entry to `acquisition/model-catalog.turn-speak-tts.psv`
2. Download with free-agents downloader
3. Add loader in `mlx-worker.mjs` (model-specific)
4. Add voice config in `turn-speak.mjs`