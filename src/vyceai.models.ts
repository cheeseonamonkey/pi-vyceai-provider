// Synced 2026-07-25 from live /v1/models + vyceai.com/dashboard-v2 pricing page.
// Pricing is best-effort (hand-transcribed from a marketing page and a
// third-party aggregator), NOT sourced from the API - see KNOWN_ISSUES.md
// "Cost accuracy" section. Run `npm run sync-models` periodically and review
// the diff by hand before merging.
//
// UPDATE 2026-07-25: live re-test with a real key showed claude-sonnet-5,
// claude-sonnet-4-6, and claude-haiku-4-5 all return HTTP 200 with real
// tool_calls when `tools` is sent - the earlier "Claude models 400 on tools"
// finding was WRONG. In fact NO tested model 400s on `tools`; the only
// request failures were claude-fable-5 / gpt-5.6-sol returning 503
// model_disabled (platform-down, unrelated to tools). So all entries are
// `toolCalls: true` - the noToolsGuard is effectively a no-op for now and
// exists only as a safety net if a future Vyce model genuinely rejects tools.
import type { ModelMeta } from "./types.js";

export const STATIC_MODELS: Record<string, ModelMeta> = {
  auto: {
    id: "auto",
    name: "Vyce AI — Auto (routing varies, no tool support)",
    reasoning: false,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 4_096,
    // Cost set to the highest ceiling across all models so spend is never
    // under-reported when `auto` silently routes to a premium backend.
    cost: { input: 10, output: 30, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true, // no evidence of tools rejection; routes to Claude which supports them
    pricingSource: "conservative ceiling, not a real rate - auto has no fixed price",
  },
  "claude-fable-5": {
    id: "claude-fable-5",
    name: "Claude Fable 5",
    reasoning: false,
    input: ["text"],
    contextWindow: 200_000,
    maxTokens: 8_192,
    cost: { input: 10, output: 30, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true, // platform-disabled (503); toolCalls moot, status warning covers it
    status: "unavailable",
    pricingSource: "vyceai.com/dashboard-v2 pricing page",
  },
  "mimo-v2.5-pro": {
    id: "mimo-v2.5-pro",
    name: "MiMo v2.5 Pro",
    reasoning: false,
    input: ["text"],
    contextWindow: 1_000_000,
    maxTokens: 8_192,
    cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true, // accepted `tools` field without error - that IS the support signal
    pricingSource: "lmspeed.net, not independently verified",
  },
  "claude-sonnet-5": {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    reasoning: false,
    input: ["text"],
    contextWindow: 200_000,
    maxTokens: 8_192,
    cost: { input: 3, output: 15, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true, // verified live 2026-07-25: 200 + real tool_calls
    pricingSource: "vyceai.com/dashboard-v2 pricing page",
  },
  "claude-sonnet-4-6": {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    reasoning: false,
    input: ["text"],
    contextWindow: 200_000,
    maxTokens: 8_192,
    cost: { input: 3, output: 15, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true, // verified live 2026-07-25: 200 + real tool_calls
    pricingSource: "vyceai.com/dashboard-v2 pricing page",
  },
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    reasoning: false,
    input: ["text"],
    contextWindow: 200_000,
    maxTokens: 8_192,
    cost: { input: 0.8, output: 4, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true, // verified live 2026-07-25: 200 + real tool_calls
    pricingSource: "vyceai.com/dashboard-v2 pricing page",
  },
  "minimax-m3": {
    id: "minimax-m3",
    name: "MiniMax M3",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 128_000,
    maxTokens: 4_096,
    cost: { input: 0.3, output: 1.2, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true, // accepted `tools` field without error
    pricingSource: "lmspeed.net, not independently verified",
  },
  "deepseek-v4-flash": {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    reasoning: false,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 8_192,
    cost: { input: 0.09, output: 0.18, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true,
    pricingSource: "vyceai.com/dashboard-v2 pricing page",
  },
  "glm-5.2": {
    id: "glm-5.2",
    name: "GLM 5.2",
    reasoning: false,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 8_192,
    cost: { input: 0.924, output: 2.904, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true,
    pricingSource: "lmspeed.net, not independently verified",
  },
  "gemini-3.1-flash-lite": {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    reasoning: false,
    input: ["text"],
    contextWindow: 1_000_000,
    maxTokens: 8_192,
    cost: { input: 0.25, output: 1.5, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true,
    pricingSource: "vyceai.com/dashboard-v2 pricing page",
  },
  "gpt-5.6-sol": {
    id: "gpt-5.6-sol",
    name: "GPT 5.6 Sol",
    reasoning: false,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 8_192,
    cost: { input: 5, output: 30, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true, // platform-disabled (503); toolCalls moot, status warning covers it
    status: "unavailable",
    pricingSource: "lmspeed.net, not independently verified",
  },
  "nemotron-ultra-550b": {
    id: "nemotron-ultra-550b",
    name: "Nemotron Ultra 3",
    reasoning: false,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 8_192,
    cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true,
    pricingSource: "lmspeed.net, not independently verified",
  },
  "nemotron-vision": {
    id: "nemotron-vision",
    name: "Nemotron Vision",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 128_000,
    maxTokens: 4_096,
    cost: { input: 0.5, output: 1.5, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true,
    pricingSource: "lmspeed.net, not independently verified",
  },
  "gemini-3.6-flash": {
    id: "gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    reasoning: false,
    input: ["text"],
    contextWindow: 1_000_000,
    maxTokens: 8_192,
    cost: { input: 1.5, output: 7.5, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true,
    pricingSource: "vyceai.com/dashboard-v2 pricing page; tools untested (rate-limited during testing)",
  },
};
