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

- **Strips `tools`** for models that break them — the payload is stripped before it's sent, so the model can't silently hallucinate file/tool results instead of admitting it can't call one
- **Context overflow auto-retry** — Vyce AI's overflow error text is normalized so Pi recognizes it as recoverable and auto-compacts + retries, instead of leaving you with a dead-end error message
- **Model-select warnings** — picking a known no-tools or platform-disabled model shows a heads-up in the UI before you burn a request on it
- **Live model discovery, static fallback** — on startup, fetches the current model list from `/v1/models` (5s timeout, single attempt — this happens on every `pi` invocation, so it can't block or retry). If that fails for any reason, it falls back to the shipped static table with no interruption. Note: this fallback itself is silent — it won't tell you discovery failed, it just quietly uses last-known-good data.

Actual request-time errors (rate limits, overflow, bad models) are surfaced normally through Pi's own error display — only the *startup discovery* fallback above is silent.

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
