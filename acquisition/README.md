# Claude TurnSpeak model acquisition

This directory contains the model-acquisition catalogue for Claude TurnSpeak's
local text-to-speech evaluation.

Model weights are not stored in Git. The catalogue pins four MLX-Audio
candidates:

- Kokoro 82M BF16 — lightweight baseline
- Qwen3-TTS 0.6B CustomVoice 8-bit — efficient neural candidate
- Qwen3-TTS 1.7B CustomVoice BF16 — quality-first candidate
- Chatterbox Turbo 8-bit — expressive voice-cloning challenger

Acquisition does not imply runtime qualification or selection as the permanent
Claude TurnSpeak provider.

## Current acquisition dependency

Until the generic model-acquisition engine is separated into an independently
installable tool, this catalogue is compatible with the downloader currently
maintained in the `local-agents` repository.

From the Claude TurnSpeak repository root, using the ordinary Hugging Face
client:

```zsh
LOCAL_AGENTS_REPO="${LOCAL_AGENTS_REPO:-$HOME/ClaudeWorkspace/local-agents}"

"$LOCAL_AGENTS_REPO/install/download-models.sh" \
  --catalog "$PWD/acquisition/model-catalog.turn-speak-tts.psv" \
  --select tts-kokoro-82m-bf16 \
  --select tts-qwen3-06b-custom-8bit \
  --select tts-qwen3-17b-custom-bf16 \
  --select tts-chatterbox-turbo-8bit
```

On a managed macOS network requiring native operating-system trust:

```zsh
LOCAL_AGENTS_REPO="${LOCAL_AGENTS_REPO:-$HOME/ClaudeWorkspace/local-agents}"

"$LOCAL_AGENTS_REPO/install/download-models-system-trust.sh" \
  --catalog "$PWD/acquisition/model-catalog.turn-speak-tts.psv" \
  --select tts-kokoro-82m-bf16 \
  --select tts-qwen3-06b-custom-8bit \
  --select tts-qwen3-17b-custom-bf16 \
  --select tts-chatterbox-turbo-8bit
```

Expected destinations:

```text
~/.models/Kokoro-82M-bf16
~/.models/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit
~/.models/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16
~/.models/chatterbox-turbo-8bit
```

The four snapshots have been acquired successfully at their pinned revisions.
Runtime acceptance remains separate and must verify:

- installation and version-locking of MLX-Audio;
- successful local model loading;
- speech generation and audio playback;
- technical-term pronunciation;
- time to first audio and sustained generation speed;
- long-turn stability;
- interruption behavior;
- memory use;
- voice fatigue and subjective quality.

The permanent provider and model must be selected from measured local results,
not acquisition status alone.
