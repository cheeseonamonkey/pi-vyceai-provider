# Known Issues

## Tool-call reliability varies by model (verified via a real agentic `pi` run, not just curl)

Sending the `tools` field to Vyce AI works for every model tested — no model
returned a 400 for it. But **actually invoking a tool correctly is a
different, model-specific behavior**, and it varies:

| Model | Observed behavior (asked to `read` a real file) |
|---|---|
| `claude-sonnet-5` | ✅ Called the real `read` tool, returned the exact file content |
| `nemotron-ultra-550b` | ✅ Called the real `read` tool, returned the exact file content |
| `deepseek-v4-flash` | ❌ Did **not** call the tool — hallucinated plausible-looking file content instead (wrong both times tested) |
| `glm-5.2` | Request rejected: `"You do not have access to this resource"` (per-key/plan restriction, not a proxy bug — see FAQ below) |

This means: if you ask Pi to read/edit files and the model doesn't actually
call a tool, **it may confidently make up file contents instead of telling
you it can't access the file.** This is a bigger risk than a clean error,
because it looks like a normal, successful answer.

**Recommendation:** for agentic workflows that rely on Pi's built-in tools
(`read`, `write`, `edit`, `bash`), prefer `claude-sonnet-5`,
`claude-sonnet-4-6`, `claude-haiku-4-5`, or `nemotron-ultra-550b`, which were
observed to call tools correctly. Treat other models' file/bash-derived
answers with skepticism until you've verified their tool-call behavior
yourself.

We do not encode this as a static `toolCalls: false` flag, because that
would strip the `tools` field entirely and make it *impossible* for the
model to ever call a tool — worse than today's unreliable-but-sometimes-fine
behavior. This is a soft reliability caveat, not a hard proxy rejection.

## No visible thinking/reasoning stream

No Vyce AI model returns a separate `reasoning_content`/thinking block, even
for models marketed as reasoning-capable — extended thinking, if it happens
server-side, is inlined into the regular response text. This plugin ships
`reasoning: false` for every model, which hides Pi's thinking-level UI
entirely rather than showing a broken/no-op control.

## `auto` has unpredictable routing and its own rate limit

`auto` returned `429 rate_limit_exceeded` consistently in testing, separate
from any other model's limits. Its effective backend, context window, and
price vary per request. Registered with a conservative (smallest) context
window and a cost ceiling (the highest of any Vyce model) so spend is never
under-reported. Pin a concrete model for anything you care about.

## Some models are platform-disabled, not per-key restricted

`claude-fable-5` and `gpt-5.6-sol` return `503 model_disabled` for every key
— this is Vyce AI reporting the model down platform-wide, not a plan/key
gate. The extension shows a warning on model selection but does not hide
these models, since Vyce AI may re-enable them at any time.

## Per-key model access (FAQ)

Getting `"You do not have access to this resource"` for a specific model
(e.g. `glm-5.2`)? That model is likely gated by your Vyce AI plan/key, not a
plugin bug. Check your dashboard at vyceai.com/dashboard-v2. This is
intentionally **not** hardcoded as globally disabled, since a different key
may have access.

## Pricing accuracy

Pricing in `src/vyceai.models.ts` was hand-transcribed from Vyce AI's
pricing page and a third-party aggregator (lmspeed.net) — the API exposes no
pricing endpoint, so nothing here is independently verified against a real
invoice. If you're doing serious budget tracking, cross-check your Vyce AI
dashboard and override rates via `modelOverrides` in `~/.pi/agent/models.json`
if needed.

## Overflow-error detection is unvalidated

`src/overflow.ts` rewrites Vyce AI overflow error messages so Pi recognizes
them and auto-compacts/retries. The regexes are based on typical OpenAI-proxy
phrasing, but we have not triggered a real context-overflow error against
Vyce AI to confirm the exact wording. If auto-recovery doesn't kick in on a
genuine overflow, the message format is the first thing to check.
