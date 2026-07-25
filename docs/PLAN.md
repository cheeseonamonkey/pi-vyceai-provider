# Vyce AI — Pi Model Provider Plugin: FINAL PLAN (v3, API-verified)

Status: All API assumptions below have been checked against the real
`@earendil-works/pi-coding-agent` docs (`extensions.md`, `custom-provider.md`,
`models.md`) and the shipped examples (`provider-payload.ts`,
`custom-provider-anthropic/`, `custom-provider-gitlab-duo/`). Anything marked
✅ is confirmed against source docs, not assumed.

---

## 0. Executive Summary

Vyce AI is an OpenAI-Chat-Completions-compatible proxy in front of 14
heterogeneous backend models (Anthropic, DeepSeek, Google, NVIDIA, MiniMax,
Z.ai, Xiaomi, OpenAI). Streaming, usage accounting, and auth are standard and
low-risk. Two things are broken/limited and must be designed around rather
than assumed away:

1. **Tool calling** is rejected outright (400) by the proxy for Claude/GPT-routed
   models, and silently no-ops for some others.
2. **No separate `reasoning_content`/thinking stream** is ever emitted by any
   model — extended thinking, if it happens, is inlined into normal text.

The plugin is a TypeScript Pi extension that registers `vyceai` as a provider,
degrades gracefully around both limitations, and ships a static model table
with a scheduled sync job to fight metadata drift.

---

## 1. Confirmed Facts (live API, 2026-07-25)

| Fact | Confidence |
|---|---|
| `GET /v1/models` needs `Authorization: Bearer`, returns `{data:[{id,created,owned_by,object}]}`, 14 entries | High |
| `POST /v1/chat/completions` — full OpenAI request/response shape, standard `usage` block | High |
| Streaming = standard OpenAI SSE (`data: {...chat.completion.chunk...}` → `[DONE]`) | High |
| `tools` field on Claude-routed models (`auto`, `claude-sonnet-5`, presumed also `claude-sonnet-4-6`, `claude-haiku-4-5`, `claude-fable-5`, `gpt-5.6-sol`) → proxy 400s `invalid_request_error` | High for tested models, inferred for the rest — **must re-verify each individually before shipping `NO_TOOLS_MODELS`, see §6** |
| `tools` field on DeepSeek/Nemotron/MiniMax → accepted, no error, no `tool_calls` emitted on prompts tried | Medium — small sample, no genuine tool-triggering prompt confirmed end-to-end |
| No `reasoning_content`/thinking field ever populated | Medium — only 2 models tested |
| No `GET /v1/models/{id}` detail endpoint (404) | High |
| `glm-5.2` → "You do not have access to this resource" with shared/demo key | High for this key only, not necessarily universal |
| `gemini-3.6-flash` → rate-limited on shared key | Inconclusive |
| No public Vyce AI API docs site exists | High |

---

## 2. Architecture

### 2.1 Design decision

Ship as a TypeScript Pi extension (npm package `pi-vyceai-provider`), because
we need:
- Async model discovery at startup (`fetch /v1/models`) ✅ confirmed supported —
  *"If the factory returns a Promise, pi awaits it before continuing startup…
  before provider registrations queued via `pi.registerProvider()` are
  flushed."* (`extensions.md`)
- A `before_provider_request` hook to strip `tools` for models that 400 on it
  ✅ confirmed: *"Returning any other value replaces the payload for later
  handlers and for the actual request."* (`extensions.md`)
- A `message_end` hook to normalize overflow errors ✅ confirmed: handlers
  *"can return `{ message }` to replace the finalized message. The
  replacement must keep the same role."* (`extensions.md`), and
  `custom-provider.md`'s "Context Overflow Errors" section gives almost the
  exact recipe we use.
- A `model_select` notify for UX warnings on no-tools/unavailable models
  ✅ confirmed notification-only event, ideal for this.

Also ship a `models.json` quick-start (no npm) for users who don't want an
extension.

### 2.2 Directory structure

```
pi-vyceai-provider/
├─ src/
│  ├─ index.ts              # Entry point — factory guard + createProvider() call
│  ├─ provider.ts            # Generic createProvider() helper (reusable for any OpenAI-compat proxy)
│  ├─ vyceai.models.ts       # Static model metadata table (local-only fields, Pi ignores unknown keys)
│  ├─ noToolsGuard.ts        # before_provider_request — strips tools/tool_choice for NO_TOOLS_MODELS
│  ├─ overflow.ts            # message_end — overflow error normaliser
│  ├─ modelWarnings.ts       # model_select — ctx.hasUI-gated notify for no-tools/unavailable models
│  └─ types.ts               # Shared TypeScript interfaces (ModelMeta, etc. — local only, not Pi fields)
├─ test/
│  ├─ provider.test.ts       # Registration & model fetch, timeout, key-absence gate
│  ├─ overflow.test.ts       # Overflow rewriter — positive cases
│  ├─ negative.test.ts       # 429 / quota / generic 5xx must NOT be rewritten
│  ├─ no-tools.test.ts       # Payload stripping scoped correctly, other providers untouched
│  ├─ reload.test.ts         # Factory run twice → no duplicate models/listeners (module guard)
│  ├─ timeout.test.ts        # Hanging mock fetch → resolves within timeout + margin
│  └─ sync-diff.test.ts      # syncModels.ts flags new/removed IDs without deleting metadata
├─ scripts/
│  └─ syncModels.ts          # Diff-aware puller: fetch /v1/models, skeleton new entries, flag removed ones
├─ config/
│  └─ vyceai.models.json     # Human-editable override reference (for the models.json quick-start mode)
├─ .github/workflows/ci.yml  # lint/typecheck/test on PR; smoke+publish gated on tags; weekly sync-check cron
├─ package.json              # "pi": { "extensions": ["./dist/index.js"] }
├─ tsconfig.json
├─ README.md
├─ KNOWN_ISSUES.md           # Tool-calling caveat, thinking-UI caveat, abort behavior, pricing disclaimer
├─ QUICKSTART-models-json.md
├─ CHANGELOG.md
├─ CONTRIBUTING.md
├─ SECURITY.md
├─ LICENSE
├─ .env.sample
└─ .npmignore
```

---

## 3. Core Implementation (corrected against real API)

### 3.1 `src/types.ts`

```ts
export interface ModelMeta {
  id: string;
  name: string;
  reasoning: boolean;                  // keep false for ALL Vyce models in v0.1 — see §4.2
  input: ("text" | "image")[];
  contextWindow: number;
  maxTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };

  // ── Local bookkeeping only — NOT recognized by Pi's ProviderModelConfig.
  // Do not assume these change Pi behavior; they only drive our own guards
  // (noToolsGuard.ts / modelWarnings.ts) and the sync script's diffing.
  toolCalls: boolean;                  // false → added to NO_TOOLS_MODELS by provider.ts
  status?: "available" | "unavailable" | "removed";
  pricingSource?: string;              // e.g. "lmspeed.net, not independently verified"
}
```

### 3.2 `src/provider.ts` — generic reusable helper

```ts
import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import type { ModelMeta } from "./types";
import { installNoToolsGuard } from "./noToolsGuard";
import { installOverflowRewriter } from "./overflow";
import { installModelWarnings } from "./modelWarnings";

export interface CreateProviderConfig {
  providerId: string;
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
  staticModels: Record<string, ModelMeta>;
  overflowPatterns: RegExp[];
}

export async function createProvider(pi: ExtensionAPI, cfg: CreateProviderConfig): Promise<void> {
  const { providerId, name, baseUrl, apiKeyEnv, staticModels, overflowPatterns } = cfg;

  // ── §2.4/§6: the extension factory runs on EVERY `pi` invocation
  // (including `pi --list-models`, `-p`, RPC) because global extensions load
  // at startup and pi awaits the factory Promise before continuing. A slow
  // or broken network call here stalls ALL of pi for users who never touch
  // this provider. Skip the network call entirely if no key is configured.
  const apiKey = process.env[apiKeyEnv];
  const remoteIds = apiKey ? await fetchModelIdsWithTimeout(baseUrl, apiKey, 5000).catch(() => []) : [];

  const allIds = remoteIds.length ? remoteIds : Object.keys(staticModels);
  const noToolsModels = new Set(
    allIds.filter((id) => (staticModels[id]?.toolCalls ?? true) === false),
  );

  const models: ProviderModelConfig[] = allIds.map((id) => {
    const meta = staticModels[id] ?? fallbackMeta(id);
    return {
      id: meta.id,
      name: meta.name,
      reasoning: false,               // §4.2 — never true in v0.1, regardless of static table
      input: meta.input,
      contextWindow: meta.contextWindow,
      maxTokens: meta.maxTokens,
      cost: meta.cost,
    };
  });

  pi.registerProvider(providerId, {
    name,
    baseUrl,
    apiKey: `$${apiKeyEnv}`,
    authHeader: true,
    api: "openai-completions",
    compat: {
      supportsDeveloperRole: false,   // thin proxy — send system role, not developer
      supportsReasoningEffort: false, // defensive; we never enable reasoning in v0.1 anyway
    },
    models,
  });

  installNoToolsGuard(pi, providerId, noToolsModels);
  installOverflowRewriter(pi, providerId, overflowPatterns);
  installModelWarnings(pi, providerId, staticModels);
}

async function fetchModelIdsWithTimeout(baseUrl: string, apiKey: string, timeoutMs: number): Promise<string[]> {
  const resp = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs), // single attempt, no retry/backoff in startup path
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const payload = (await resp.json()) as { data?: Array<{ id: string }> };
  if (!Array.isArray(payload?.data)) throw new Error("Unexpected /models shape");
  return payload.data.map((m) => m.id);
}

function fallbackMeta(id: string): ModelMeta {
  return {
    id,
    name: id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    reasoning: false,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 4_096,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    toolCalls: false,   // conservative default for unknown models
  };
}
```

### 3.3 `src/noToolsGuard.ts` — §2.1's mitigation, confirmed implementable

`supportsStrictMode` is **not** relevant here (it only controls the `strict`
field on tool *definitions*). The only correct mechanism is stripping
`tools`/`tool_choice` from the outbound payload in `before_provider_request`,
whose return-to-replace contract is confirmed by `provider-payload.ts`:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function installNoToolsGuard(pi: ExtensionAPI, providerId: string, noToolsModels: Set<string>): void {
  pi.on("before_provider_request", (event, ctx) => {
    if (ctx.model?.provider !== providerId) return;
    if (!ctx.model?.id || !noToolsModels.has(ctx.model.id)) return;
    if (!event.payload || typeof event.payload !== "object") return;

    const payload = event.payload as Record<string, unknown>;
    if (!("tools" in payload) && !("tool_choice" in payload)) return;

    const { tools, tool_choice, ...rest } = payload;
    return rest;
  });
}
```

### 3.4 `src/overflow.ts` — corrected per verification

Two corrections applied vs. the earlier draft:
1. Check `stopReason === "error"` **first** (per the docs' canonical recipe) —
   avoids running regexes on every normal completion.
2. Tightened patterns — dropped `/too many tokens/i` and `/max context/i`,
   which risk matching rate-limit/quota messages. Docs explicitly warn:
   *"Rewriting rate-limit or throttling errors... would falsely trigger
   compaction instead of pi's normal retry-with-backoff path."*

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const DEFAULT_OVERFLOW_PATTERNS: RegExp[] = [
  /context (?:length )?exceeded/i,
  /context window (?:exceeded|overflow)/i,
  /input too long/i,
];

export function installOverflowRewriter(pi: ExtensionAPI, providerId: string, patterns: RegExp[]): void {
  pi.on("message_end", (event, ctx) => {
    const message = event.message;
    if (message.role !== "assistant") return;
    if (message.stopReason !== "error") return;                 // ← added guard
    if (message.provider !== providerId && ctx.model?.provider !== providerId) return;

    const errorMessage = message.errorMessage ?? "";
    if (!errorMessage) return;
    if (errorMessage.includes("context_length_exceeded")) return; // idempotency
    if (!patterns.some((re) => re.test(errorMessage))) return;

    return {
      message: { ...message, errorMessage: `context_length_exceeded: ${errorMessage}` },
    };
  });
}
```

### 3.5 `src/modelWarnings.ts`

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ModelMeta } from "./types";

export function installModelWarnings(pi: ExtensionAPI, providerId: string, staticModels: Record<string, ModelMeta>): void {
  pi.on("model_select", (event, ctx) => {
    if (event.model.provider !== providerId) return;
    if (!ctx.hasUI) return;                       // print/JSON/RPC-without-UI safe-guard

    const meta = staticModels[event.model.id];
    if (!meta) return;

    if (meta.toolCalls === false) {
      ctx.ui.notify(
        "This model does not support tool calling through Vyce AI — Pi's file/bash tools will be unavailable.",
        "warn",
      );
    }
    if (meta.status === "unavailable") {
      ctx.ui.notify(
        "Vyce AI currently reports this model as unavailable. Requests may fail until it's restored.",
        "warn",
      );
    }
  });
}
```

### 3.6 `src/index.ts` — module-load guard (fixes reload/double-registration risk)

`/reload` spawns a fresh extension instance (safe by itself), but a double
factory invocation within one process (bad packages config, tests, etc.)
would otherwise accumulate duplicate `pi.on` listeners and re-run
`registerProvider`. Guard defensively:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createProvider } from "./provider";
import { STATIC_MODELS } from "./vyceai.models";
import { DEFAULT_OVERFLOW_PATTERNS } from "./overflow";

let installed = false;

export default async function (pi: ExtensionAPI) {
  if (installed) return;
  installed = true;

  await createProvider(pi, {
    providerId: "vyceai",
    name: "Vyce AI",
    baseUrl: "https://vyceai.com/v1",
    apiKeyEnv: "VYCEAI_API_KEY",
    staticModels: STATIC_MODELS,
    overflowPatterns: DEFAULT_OVERFLOW_PATTERNS,
  });
}
```

### 3.7 `src/vyceai.models.ts` — static table (corrected)

- `reasoning` set to `false` for all models regardless of backend capability
  (§4.2 — no separate thinking stream exists through this proxy).
- `toolCalls: false` for `auto`, `claude-fable-5`, `claude-sonnet-5`,
  `claude-sonnet-4-6`, `claude-haiku-4-5`, `gpt-5.6-sol` — **pending
  per-model re-verification, see §6 Go/No-Go**.
- `status: "unavailable"` only for models Vyce AI's own pricing page marks
  down platform-wide (`claude-fable-5`, `gpt-5.6-sol` as of writing) — not
  for per-key-restricted models like `glm-5.2` (§ per-key access is handled
  by documentation/FAQ, not a static flag — a paying user might have access).
- `maxTokens` bumped above the earlier draft's flat 4096 for models where the
  upstream plausibly supports more output (coding-oriented models); left
  conservative where unknown. Pi's own default is 16384.
- Header comment records "as of" date so staleness is visible in review.

```ts
// Synced 2026-07-25 from live /v1/models + vyceai.com/dashboard-v2 pricing page.
// Pricing not independently verified against a billing invoice — see README disclaimer.
import type { ModelMeta } from "./types";

export const STATIC_MODELS: Record<string, ModelMeta> = {
  auto: {
    id: "auto", name: "Vyce AI — Auto (routing varies, no tool support)",
    reasoning: false, input: ["text"], contextWindow: 128_000, maxTokens: 4_096,
    cost: { input: 5, output: 30, cacheRead: 0, cacheWrite: 0 }, // highest-cost ceiling: never under-report spend
    toolCalls: false,
  },
  "claude-fable-5": {
    id: "claude-fable-5", name: "Claude Fable 5",
    reasoning: false, input: ["text"], contextWindow: 200_000, maxTokens: 8_192,
    cost: { input: 10, output: 30, cacheRead: 0, cacheWrite: 0 },
    toolCalls: false, status: "unavailable",
  },
  "mimo-v2.5-pro": {
    id: "mimo-v2.5-pro", name: "MiMo v2.5 Pro",
    reasoning: false, input: ["text"], contextWindow: 1_000_000, maxTokens: 8_192,
    cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    toolCalls: false, // §6: proxy accepted `tools` field but never emitted tool_calls in sample prompts
  },
  "claude-sonnet-5": {
    id: "claude-sonnet-5", name: "Claude Sonnet 5",
    reasoning: false, input: ["text"], contextWindow: 200_000, maxTokens: 8_192,
    cost: { input: 3, output: 15, cacheRead: 0, cacheWrite: 0 },
    toolCalls: false,
  },
  "claude-sonnet-4-6": {
    id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6",
    reasoning: false, input: ["text"], contextWindow: 200_000, maxTokens: 8_192,
    cost: { input: 3, output: 15, cacheRead: 0, cacheWrite: 0 },
    toolCalls: false, // presumed — verify per §6 before release
  },
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5", name: "Claude Haiku 4.5",
    reasoning: false, input: ["text"], contextWindow: 200_000, maxTokens: 8_192,
    cost: { input: 0.8, output: 4, cacheRead: 0, cacheWrite: 0 },
    toolCalls: false, // presumed — verify per §6 before release
  },
  "minimax-m3": {
    id: "minimax-m3", name: "MiniMax M3",
    reasoning: false, input: ["text", "image"], contextWindow: 128_000, maxTokens: 4_096,
    cost: { input: 0.3, output: 1.2, cacheRead: 0, cacheWrite: 0 },
    toolCalls: false,
  },
  "deepseek-v4-flash": {
    id: "deepseek-v4-flash", name: "DeepSeek V4 Flash",
    reasoning: false, input: ["text"], contextWindow: 128_000, maxTokens: 8_192,
    cost: { input: 0.09, output: 0.18, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true, // accepted tools field cleanly; treat as tool-capable pending §3.1's matrix
  },
  "glm-5.2": {
    id: "glm-5.2", name: "GLM 5.2",
    reasoning: false, input: ["text"], contextWindow: 128_000, maxTokens: 8_192,
    cost: { input: 0.924, output: 2.904, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true, // per-key access issue handled via README FAQ, not a static disable
  },
  "gemini-3.1-flash-lite": {
    id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite",
    reasoning: false, input: ["text"], contextWindow: 1_000_000, maxTokens: 8_192,
    cost: { input: 0.25, output: 1.5, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true,
  },
  "gpt-5.6-sol": {
    id: "gpt-5.6-sol", name: "GPT 5.6 Sol",
    reasoning: false, input: ["text"], contextWindow: 128_000, maxTokens: 8_192,
    cost: { input: 5, output: 30, cacheRead: 0, cacheWrite: 0 },
    toolCalls: false, status: "unavailable",
  },
  "nemotron-ultra-550b": {
    id: "nemotron-ultra-550b", name: "Nemotron Ultra 3",
    reasoning: false, input: ["text"], contextWindow: 128_000, maxTokens: 8_192,
    cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true,
  },
  "nemotron-vision": {
    id: "nemotron-vision", name: "Nemotron Vision",
    reasoning: false, input: ["text", "image"], contextWindow: 128_000, maxTokens: 4_096,
    cost: { input: 0.5, output: 1.5, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true,
  },
  "gemini-3.6-flash": {
    id: "gemini-3.6-flash", name: "Gemini 3.6 Flash",
    reasoning: false, input: ["text"], contextWindow: 1_000_000, maxTokens: 8_192,
    cost: { input: 1.5, output: 7.5, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true, // rate-limited during testing — unconfirmed either way
  },
};
```

---

## 4. Known Limitations (ship in README + KNOWN_ISSUES.md)

### 4.1 Tool calling

Pi's agent tools (`bash`, `read`, `write`, `edit`, etc.) will not function on
Claude/GPT-routed Vyce AI models — the proxy 400s if `tools` is sent, so the
plugin strips it, meaning the model just chats without ever touching the
filesystem. Users needing tool calling should pick DeepSeek, Nemotron,
Gemini, or MiniMax models. A `model_select` warning surfaces this at
selection time so it's not silent.

### 4.2 No visible thinking/reasoning stream

No Vyce AI model returns a separate `reasoning_content`/thinking block, even
for models marketed as reasoning-capable — extended thinking, if it happens
server-side, is inlined into the regular response text. We therefore ship
`reasoning: false` for every model in v0.1, hiding Pi's thinking-level UI
entirely rather than showing a broken/no-op control. Revisit if Vyce AI ever
starts returning `reasoning_content` (grep raw responses per §6's live
verification matrix; flip the flag for that model only, and consider
`compat.thinkingFormat: "zai"` for `glm-5.2` specifically since that option
exists natively in Pi for Z.ai-style thinking).

### 4.3 `auto` model

Non-deterministic backend routing, rejects tool calls, unknown effective
context/pricing per request. Registered with a conservative (smallest)
context window and a cost ceiling (highest across all models, so spend is
never under-reported), added to `NO_TOOLS_MODELS`, and listed last in the
README's model table with a footnote steering users to pin a concrete model.

### 4.4 Static table drift

Vyce AI is young and iterating fast (2 of 14 models already marked
"Unavailable" on the pricing page at time of writing). `scripts/syncModels.ts`
is diff-aware: new IDs get a skeleton entry + loud console warning; removed
IDs are marked `status: "removed"` (filtered out of registration, kept in
source for history) rather than silently deleted. A weekly CI cron runs the
sync against a secret key and opens a bot PR for human review — never
auto-merged.

### 4.5 Cost accuracy

Pricing was hand-transcribed from a marketing page and a third-party
aggregator, not sourced from the API (which exposes no pricing endpoint).
Disclaimed prominently in README + inline comments; users doing serious
budget tracking should cross-check their Vyce AI dashboard invoice and can
override via `modelOverrides` in `models.json`.

### 4.6 Per-key model access variance

`glm-5.2` returned "no access" for the shared test key — this is likely
plan/key-gated, not universally broken, so it is **not** hardcoded as
disabled. A README FAQ entry explains the error and points to the Vyce AI
dashboard.

---

## 5. CI Pipeline

```yaml
name: CI
on:
  push: { branches: [main], tags: ["v*"] }
  pull_request:
  schedule:
    - cron: "0 6 * * 1"   # weekly Monday model-sync check

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --coverage

  smoke:
    if: startsWith(github.ref, 'refs/tags/')
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci && npm run build
      - run: npm run smoke
        env: { VYCEAI_SMOKE_KEY: ${{ secrets.VYCEAI_SMOKE_KEY }} }

  publish:
    if: startsWith(github.ref, 'refs/tags/')
    needs: smoke
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, registry-url: "https://registry.npmjs.org" }
      - run: npm ci && npm run build
      - run: npm publish --access public
        env: { NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }} }

  model-sync-check:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run sync-models
        env: { VYCEAI_SMOKE_KEY: ${{ secrets.VYCEAI_SMOKE_KEY }} }
      - uses: peter-evans/create-pull-request@v6
        with:
          commit-message: "chore: sync vyceai model list"
          title: "🔄 Weekly Vyce AI model sync"
          branch: auto/sync-models
          body: "Automated model list sync. **Review pricing/context-window for any new entries before merging.**"
```

Smoke and publish are tag-gated only — never run on every PR — to avoid
burning API credits and flaking on network issues. Publish depends on smoke,
so no release ships without one real, live end-to-end confirmation.

---

## 6. Go/No-Go Checklist for v0.1.0

- [ ] Live-verification matrix run at least once per model:
  - non-streaming chat (200 + valid content)
  - streaming chat (valid SSE → `[DONE]`)
  - `tools` array sent — confirm 400 vs. accepted for **every** model in
    `NO_TOOLS_MODELS`, not just the two originally tested; update the set
    based on real results, not assumption
  - genuine tool-triggering prompt (e.g. `get_current_time()`, no args) for
    every model NOT in `NO_TOOLS_MODELS` — confirm `tool_calls` actually
    appears at least once
  - hard reasoning prompt, grep raw response for `reasoning_content` /
    `thinking` / `<think>` on every reasoning-marketed model
  - developer-role message via raw curl (bypass Pi) — confirm accept/reject,
    set `compat.supportsDeveloperRole` from evidence
  - abort mid-stream (long response, abort ~1s in) — confirm clean client-side
    stream end, no hung promise; note billing behavior manually via dashboard
  - Results recorded in `test/LIVE_VERIFICATION.md` (checklist, re-run whenever
    Vyce AI's behavior is suspected to have changed)
- [ ] `NO_TOOLS_MODELS` / `staticModels[...].toolCalls` updated from actual
      per-model test results
- [ ] All unit tests green, coverage ≥ 85% on `src/`
- [ ] `npm run smoke` passes against a real key in CI
- [ ] README's Known Limitations section reviewed against final test results
- [ ] `syncModels.ts` run fresh immediately before tagging, diff reviewed by hand
- [ ] `SECURITY.md` confirms key never logged (grep codebase for `console.log`
      near `apiKey`/`key` variables as a final pass)
- [ ] npm package name availability confirmed
- [ ] Tag `v0.1.0`; CI publishes only after `smoke` passes

---

## 7. Timeline

| Day | Deliverable |
|---|---|
| 1 | Repo scaffold, `types.ts`, `vyceai.models.ts`, `provider.ts`, `noToolsGuard.ts`, `overflow.ts`, `modelWarnings.ts`, `index.ts` |
| 2 | Unit tests (all 6 files in §2.2), CI workflow |
| 3 | Live-verification matrix run for real (§6), `syncModels.ts`, `models.json` quickstart, README |
| 4 | npm publish `v0.1.0-next`, smoke test with real key |
| 5 | Final polish, `SECURITY.md`, `CONTRIBUTING.md`, `KNOWN_ISSUES.md`, tag `v0.1.0` |

~5 focused days.

---

## 8. Reusable abstraction

`createProvider()` in `src/provider.ts` only knows `providerId`, `name`,
`baseUrl`, `apiKeyEnv`, `staticModels`, `overflowPatterns` — nothing
Vyce-specific. The same helper (plus `noToolsGuard.ts`/`overflow.ts`/
`modelWarnings.ts`) works unmodified for any other OpenAI-compatible proxy
(vLLM, LM Studio, a corporate gateway). A new provider plugin needs only a new
`*.models.ts` file and a 2-line `index.ts`. This is the most valuable
abstraction in the codebase and should stay dependency-free of anything
Vyce-specific.
