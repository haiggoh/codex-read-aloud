# Privacy

Codex Read Aloud is local-first.

## What It Reads

- In Codex, it can read the newest assistant message from local Codex session JSONL files when you run `scripts/speak-latest-codex.mjs`.
- In Claude Code, it can speak text the agent explicitly passes to `scripts/speak-text.mjs`, or read the newest completed main-agent text response from Claude Code's existing local transcript when you explicitly run `scripts/speak-latest-claude.mjs`.
- Claude latest-response mode registers no hook and creates no duplicate response cache.
- It cleans Markdown before speech and omits fenced code blocks by default.

## What Leaves Your Machine

Nothing leaves your machine when `provider` is `macos`.

When `provider` is `openai`, the text being spoken is sent to OpenAI's text-to-speech API. Your OpenAI API key is read from `OPENAI_API_KEY` or macOS Keychain.

## Secrets

The recommended API key setup stores your key in macOS Keychain:

```bash
node scripts/store-openai-key.mjs
```

The key is not written to the plugin repo, Codex config, Claude Code settings, session logs, or runtime config file.

## Telemetry

This plugin does not collect telemetry.
