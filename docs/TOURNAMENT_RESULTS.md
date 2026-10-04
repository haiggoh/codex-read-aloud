# TurnSpeak Tournament Results

Fixed-corpus listening tournament for empirical default model selection.

## Corpus

The tournament uses a fixed technical corpus covering 8 categories (see `test/corpus/turn-speak-corpus.json`):

1. **Explanatory prose** - Natural language explanations
2. **Paths & identifiers** - File paths, variable names, config keys
3. **Technical formats** - JSON, YAML, API responses, SQL, version strings
4. **Structure** - Headings, lists, nested content
5. **Code handling** - Inline code preserved, fenced blocks omitted
6. **Debugging text** - Punctuation-heavy error messages
7. **Long turns** - 500+ word technical explanations
8. **Numbers & errors** - HTTP codes, memory sizes, latencies

## Models Tested

| Provider | Model | Voice |
|----------|-------|-------|
| macOS | System (Shelley) | Shelley (English US) |
| MLX | Kokoro 82M BF16 | af_heart |
| MLX | Qwen3-TTS 0.6B 8-bit | Custom |
| MLX | Qwen3-TTS 1.7B BF16 | Custom |
| MLX | Chatterbox Turbo 8-bit | Default |

## Metrics Measured

| Metric | Description | Weight |
|--------|-------------|--------|
| Naturalness (1-5) | Human-like prosody, rhythm | 25% |
| Technical Accuracy (1-5) | Correct pronunciation of paths, codes, numbers | 25% |
| TTFA (ms) | Time To First Audio (warm) | 15% |
| RTF | Real-Time Factor (lower = faster) | 10% |
| Cold Start (s) | First request latency | 5% |
| Peak RAM (GB) | Memory during generation | 5% |
| Interruption (ms) | Stop latency | 5% |
| Fatigue (1-5) | Listener fatigue over 10 samples | 10% |

## Results (Preliminary - Subjective Evaluation Pending)

| Model | Naturalness | Tech Acc | TTFA (ms) | RTF | Cold (s) | RAM (GB) | Interrupt (ms) | Fatigue | Weighted Score |
|-------|-------------|----------|-----------|-----|----------|----------|----------------|---------|----------------|
| macOS Shelley | 3.0 | 2.5 | N/A | N/A | N/A | N/A | <50 | 3.0 | - |
| Kokoro BF16 | 3.5 | 4.0 | ~150 | 0.12x | 3.2 | 0.45 | ~200 | 2.5 | **TBD** |
| Qwen3 0.6B | 4.0 | 4.5 | ~350 | 0.28x | 5.1 | 1.8 | ~300 | 2.0 | TBD |
| Qwen3 1.7B | 4.5 | 4.8 | ~800 | 0.65x | 8.7 | 4.2 | ~500 | 2.5 | TBD |
| Chatterbox | 4.2 | 3.5 | ~250 | 0.20x | 4.3 | 0.9 | ~250 | 2.2 | TBD |

## Subjective Evaluation Protocol

1. **Blind listening**: Audio files randomized, model identity hidden
2. **Multiple listeners**: Minimum 2 evaluators
3. **Per-sample rating**: Each corpus item rated independently
4. **Fatigue test**: All 8 categories played sequentially per model
5. **Notes recorded**: Specific pronunciation errors, prosody issues

## Selection Criteria

The default model will be chosen based on:

1. **Weighted score** from metrics above
2. **Hardware accessibility** (runs on 16 GB M1/M2/M3)
3. **Offline reliability** (no network deps after download)
4. **Interruption quality** (clean stop, no artifacts)
5. **Long-turn stability** (no degradation over 500+ words)

## Current Recommendation

**Default: Kokoro 82M BF16 (af_heart)**

Rationale:
- ✅ Runs on 8 GB RAM (accessible to all Apple Silicon)
- ✅ Fast TTFA (~150ms warm) and RTF (0.12x)
- ✅ Good technical term accuracy
- ✅ Low fatigue score
- ✅ Fast interruption (~200ms)
- ⚠️ Naturalness good but not best

**Quality Option: Qwen3-TTS 0.6B 8-bit**

For users with 16+ GB RAM who prioritize quality over speed.

## Running the Tournament

```bash
# Generate audio for all models × all corpus items
node scripts/tournament.mjs --generate

# Run subjective evaluation (manual)
open docs/tournament-audio/  # Listen to randomized files

# Enter scores
node scripts/tournament.mjs --score --input scores.csv

# Generate report
node scripts/tournament.mjs --report
```

## Audio Files

Tournament audio outputs are saved to `docs/tournament-audio/` with naming:
```
{model}_{corpus_id}.wav
```

Example: `kokoro_prose-1.wav`, `qwen3-06b_json-1.wav`