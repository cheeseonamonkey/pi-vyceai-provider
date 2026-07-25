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

All 14 models Vyce AI exposes, and exactly what's been verified vs. not — no cherry-picking:

| Model | Context | Cost in/out ($/M) | Tool-call reliability |
|---|---|---|---|
| `claude-sonnet-5` | 200K | 3 / 15 | ✅ Tested — calls real tools correctly |
| `nemotron-ultra-550b` | 128K | 1 / 2 | ✅ Tested — calls real tools correctly |
| `deepseek-v4-flash` | 128K | 0.09 / 0.18 | ❌ Tested — hallucinates instead of calling tools |
| `glm-5.2` | 128K | 0.924 / 2.904 | Untested — access denied on our key (plan-gated) |
| `claude-sonnet-4-6` | 200K | 3 / 15 | Untested (same family as claude-sonnet-5) |
| `claude-haiku-4-5` | 200K | 0.8 / 4 | Untested (same family) |
| `claude-fable-5` | 200K | 10 / 30 | Untested — platform-disabled (503) |
| `gpt-5.6-sol` | 128K | 5 / 30 | Untested — platform-disabled (503) |
| `nemotron-vision` | 128K | 0.5 / 1.5 | Untested |
| `gemini-3.1-flash-lite` | 1M | 0.25 / 1.5 | Untested |
| `gemini-3.6-flash` | 1M | 1.5 / 7.5 | Untested — rate-limited during testing |
| `minimax-m3` | 128K | 0.3 / 1.2 | Untested |
| `mimo-v2.5-pro` | 1M | 1 / 1 | Untested |
| `auto` | 128K | 10 / 30 (ceiling, not real) | Avoid — unpredictable routing, own 429 limit |

*Pricing is hand-transcribed from Vyce AI's pricing page — the API exposes no pricing endpoint, so nothing here is independently verified against a billing invoice.*

## Sanity

- **No model has ever actually rejected `tools`** (no 400s observed across any tested model) — but that doesn't mean tool calls are reliable. `deepseek-v4-flash` accepts the field and then hallucinates fake file contents instead of calling the real tool. A `noToolsGuard` mechanism exists in the code to strip `tools` from the payload for any model flagged unreliable, but **it's currently a dormant no-op** — nothing is flagged that way today, since stripping tools entirely would make a *sometimes-works* model *never* work. Treat the table above as the actual source of truth, not the guard.
- **Context overflow auto-retry** — Vyce AI's overflow error text is normalized so Pi recognizes it as recoverable and auto-compacts + retries, instead of leaving you with a dead-end error message
- **Model-select warnings** — picking a known platform-disabled model shows a heads-up in the UI before you burn a request on it
- **Live model discovery, static fallback** — on startup, fetches the current model list from `/v1/models` (5s timeout, single attempt — this happens on every `pi` invocation, so it can't block or retry). If that fails for any reason, it falls back to the shipped static table with no interruption. This fallback is silent — it won't tell you discovery failed, it just quietly uses last-known-good data.

Actual request-time errors (rate limits, overflow, bad models) are surfaced normally through Pi's own error display — only the *startup discovery* fallback above is silent.

More detail on all of the above → [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).

## Development

```bash
npm install
npm test           # unit tests
npm run typecheck  # TypeScript
npm run build      # produces dist/
```

## License

MIT
