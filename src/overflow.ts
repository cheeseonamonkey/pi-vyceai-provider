import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Context-window-specific overflow patterns only. Deliberately does NOT
 * include broader phrases like /too many tokens/i or /max context/i, which
 * risk matching rate-limit/quota-exceeded messages - rewriting those would
 * falsely trigger Pi's compaction-and-retry path instead of its normal
 * retry-with-backoff path for throttling. See docs/custom-provider.md
 * "Context Overflow Errors".
 */
export const DEFAULT_OVERFLOW_PATTERNS: RegExp[] = [
  /context (?:length )?exceeded/i,
  /context window (?:exceeded|overflow)/i,
  /input too long/i,
];

/**
 * Normalizes Vyce AI's overflow error messages so Pi recognizes them and
 * auto-recovers (drop failed message, compact, retry once). Mirrors the
 * canonical recipe in docs/custom-provider.md, with the added
 * `stopReason === "error"` guard run before any regex work.
 */
export function installOverflowRewriter(pi: ExtensionAPI, providerId: string, patterns: RegExp[]): void {
  pi.on("message_end", (event, ctx) => {
    const message = event.message;
    if (message.role !== "assistant") return undefined;
    if (message.stopReason !== "error") return undefined;
    if (message.provider !== providerId && ctx.model?.provider !== providerId) return undefined;

    const errorMessage = message.errorMessage ?? "";
    if (!errorMessage) return undefined;
    if (errorMessage.includes("context_length_exceeded")) return undefined; // idempotency guard

    const matched = patterns.some((re) => re.test(errorMessage));
    if (!matched) return undefined;

    return {
      message: {
        ...message,
        errorMessage: `context_length_exceeded: ${errorMessage}`,
      },
    };
  });
}
