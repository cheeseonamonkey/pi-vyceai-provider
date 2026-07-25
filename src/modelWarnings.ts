import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ModelMeta } from "./types.js";

/**
 * `model_select` is notification-only (handler return values are ignored),
 * which is exactly the right shape for a one-time UX warning when a user
 * picks a model with known limitations. Guarded with `ctx.hasUI` since this
 * event also fires in print/JSON/headless RPC contexts with no UI surface.
 */
export function installModelWarnings(pi: ExtensionAPI, providerId: string, staticModels: Record<string, ModelMeta>): void {
  pi.on("model_select", (event, ctx) => {
    if (event.model.provider !== providerId) return;
    if (!ctx.hasUI) return;

    const meta = staticModels[event.model.id];
    if (!meta) return;

    if (meta.toolCalls === false) {
      ctx.ui.notify(
        "This model does not support tool calling through Vyce AI — Pi's file/bash tools will be unavailable.",
        "warning",
      );
    }
    if (meta.status === "unavailable") {
      ctx.ui.notify(
        "Vyce AI currently reports this model as unavailable. Requests may fail until it's restored.",
        "warning",
      );
    }
  });
}
