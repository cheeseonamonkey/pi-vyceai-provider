import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Strips `tools`/`tool_choice` from the outbound provider payload for models
 * known to reject them. Confirmed implementable against Pi's real API:
 * `before_provider_request` handlers may return a replacement payload -
 * "Returning any other value replaces the payload for later handlers and for
 * the actual request." (docs/custom-provider.md)
 *
 * NOTE: `compat.supportsStrictMode` is unrelated to this - it only controls
 * the `strict` field on tool *definitions*, not whether tools are sent at
 * all. Stripping the payload here is the only correct mechanism.
 */
export function installNoToolsGuard(pi: ExtensionAPI, providerId: string, noToolsModels: ReadonlySet<string>): void {
  pi.on("before_provider_request", (event, ctx) => {
    if (ctx.model?.provider !== providerId) return undefined;
    if (!ctx.model?.id || !noToolsModels.has(ctx.model.id)) return undefined;
    if (!event.payload || typeof event.payload !== "object") return undefined;

    const payload = event.payload as Record<string, unknown>;
    if (!("tools" in payload) && !("tool_choice" in payload)) return undefined;

    const { tools: _tools, tool_choice: _toolChoice, ...rest } = payload;
    return rest;
  });
}
