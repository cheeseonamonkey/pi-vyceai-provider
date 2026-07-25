# pi-vyceai-provider

[![npm](https://img.shields.io/npm/dw/pi-vyceai-provider)](https://www.npmjs.com/package/pi-vyceai-provider)
[![pi.dev](https://img.shields.io/badge/pi.dev-package-blue)](https://pi.dev/packages/pi-vyceai-provider)
[![GitHub](https://img.shields.io/badge/GitHub-repo-black?logo=github)](https://github.com/cheeseonamonkey/pi-vyceai-provider)

A [Pi](https://github.com/earendil-works/pi-mono) extension that registers [Vyce AI](https://vyceai.com) as a model provider — 14+ models via OpenAI-compatible proxy.

## Install

```bash
pi install npm:pi-vyceai-provider
export VYCEAI_API_KEY=sk-...
pi --model vyceai/deepseek-v4-flash
```

## Models

| Model | Context | Cost in/out ($/M) | Notes |
|---|---|---|---|
| `claude-sonnet-5` | 200K | 3 / 15 | ✅ Reliable tool calls |
| `nemotron-ultra-550b` | 128K | 1 / 2 | ✅ Reliable tool calls |
| `claude-haiku-4-5` | 200K | 0.8 / 4 | Presumed reliable |
| `deepseek-v4-flash` | 128K | 0.09 / 0.18 | ⚠️ Hallucinates tool results |
| `gemini-3.1-flash-lite` | 1M | 0.25 / 1.5 | Untested |
| `auto` | 128K | — | Avoid — unpredictable routing & 429s |

## Sanity

- **Strips `tools`** for models that break them — no more silent hallucinated file reads
- **Context overflow auto-retry** — normalizes upstream errors so Pi recovers automatically
- **Model warnings** — surfaces no-tools and unavailable-model alerts at selection time
- **Live discovery** with static fallback — fetches live `/v1/models` on startup, falls back to shipped table if the API is unreachable

Full table with context windows, availability, and all models → [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).

## Development

```bash
npm install
npm test           # unit tests
npm run typecheck  # TypeScript
npm run build      # produces dist/
```

## License

MIT
