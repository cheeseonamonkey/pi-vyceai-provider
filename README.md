# pi-vyceai-provider

[![npm](https://img.shields.io/npm/dw/pi-vyceai-provider)](https://www.npmjs.com/package/pi-vyceai-provider)
[![pi.dev](https://img.shields.io/badge/pi.dev-package-blue)](https://pi.dev/packages/pi-vyceai-provider)
[![GitHub](https://img.shields.io/badge/GitHub-repo-black?logo=github)](https://github.com/cheeseonamonkey/pi-vyceai-provider)

A [Pi](https://github.com/earendil-works/pi-mono) extension that registers [Vyce AI](https://vyceai.com) as a model provider — 14 models via OpenAI-compatible proxy.

## Install

```bash
pi install npm:pi-vyceai-provider
export VYCEAI_API_KEY=sk-...
pi --model vyceai/deepseek-v4-flash
```

## Models

Context, max-out, and image support are **inferred** — `/v1/models` returns IDs only. Pricing is transcribed from Vyce's page or an aggregator, never invoice-checked.

| Model | Context | Max out | Input | $/M in→out | Tool use |
|---|---|---|---|---|---|
| `claude-sonnet-5` | 200K | 8,192 | text | 3 / 15 | ✅ calls tools correctly |
| `nemotron-ultra-550b` | 128K | 8,192 | text | 1 / 2 | ✅ calls tools correctly |
| `deepseek-v4-flash` | 128K | 8,192 | text | 0.09 / 0.18 | ❌ hallucinates instead |
| `claude-sonnet-4-6` | 200K | 8,192 | text | 3 / 15 | untested |
| `claude-haiku-4-5` | 200K | 8,192 | text | 0.8 / 4 | untested |
| `nemotron-vision` | 128K | 4,096 | text, image? | 0.5 / 1.5 | untested |
| `minimax-m3` | 128K | 4,096 | text, image? | 0.3 / 1.2 | untested |
| `gemini-3.1-flash-lite` | 1M | 8,192 | text | 0.25 / 1.5 | untested |
| `gemini-3.6-flash` | 1M | 8,192 | text | 1.5 / 7.5 | untested |
| `mimo-v2.5-pro` | 1M | 8,192 | text | 1 / 1 | untested |
| `glm-5.2` | 128K | 8,192 | text | 0.924 / 2.904 | plan-gated |
| `claude-fable-5` | 200K | 8,192 | text | 10 / 30 | disabled (503) |
| `gpt-5.6-sol` | 128K | 8,192 | text | 5 / 30 | disabled (503) |
| `auto` | 128K | 4,096 | text | 10 / 30 (ceiling) | avoid — routing varies |

Every model accepts `tools`; the column is whether it uses them well. Override any value via `modelOverrides` in `~/.pi/agent/models.json`.

## Sanity

- **Overflow auto-retry** — Vyce's overflow errors are normalized so Pi auto-compacts and retries instead of dead-ending
- **Model-select warnings** — picking a disabled model warns before you spend a request
- **Live discovery, static fallback** — startup fetches `/v1/models` (5s, one attempt); on failure it silently uses the shipped table
- **`noToolsGuard`** — can strip `tools` per-model, currently a deliberate no-op

Request-time errors surface through Pi normally; only the startup fallback is silent.

Details → [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).

## Development

```bash
npm install
npm test           # unit tests
npm run typecheck  # TypeScript
npm run build      # produces dist/
```

## License

MIT
