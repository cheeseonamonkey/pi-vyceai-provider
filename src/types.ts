/**
 * Local metadata describing a Vyce AI model.
 *
 * IMPORTANT: `toolCalls`, `status`, and `pricingSource` are LOCAL bookkeeping
 * fields only. They are NOT recognized by Pi's `ProviderModelConfig` type and
 * do nothing if passed through to `pi.registerProvider()`. They exist purely
 * to drive our own guards:
 *   - `toolCalls: false` -> model id added to the NO_TOOLS_MODELS set,
 *     consumed by `noToolsGuard.ts` (before_provider_request payload strip)
 *     and `modelWarnings.ts` (model_select notify).
 *   - `status: "unavailable"` -> `modelWarnings.ts` shows a warning on select.
 *   - `status: "removed"` -> filtered out of registration entirely by
 *     provider.ts (kept in source for history / rollback).
 */
export interface ModelMeta {
  id: string;
  name: string;
  /** Always false in v0.1 - see KNOWN_ISSUES.md ("No visible thinking stream"). */
  reasoning: boolean;
  input: ("text" | "image")[];
  contextWindow: number;
  maxTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  /** Local-only. Whether this model can accept the OpenAI `tools` field without
   * the Vyce AI proxy rejecting the request (400) or silently no-oping it. */
  toolCalls: boolean;
  /** Local-only. Provider-reported platform-wide status (not a per-key issue). */
  status?: "available" | "unavailable" | "removed";
  /** Local-only. Free-text note on where the `cost` figures came from. */
  pricingSource?: string;
}
