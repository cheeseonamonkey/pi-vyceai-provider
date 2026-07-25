import { describe, expect, it, jest } from "@jest/globals";
import { DEFAULT_OVERFLOW_PATTERNS, installOverflowRewriter } from "../src/overflow.js";

function fakePi() {
  const handlers: Record<string, Array<(event: unknown, ctx: unknown) => unknown>> = {};
  return {
    on: jest.fn((event: string, handler: (e: unknown, c: unknown) => unknown) => {
      (handlers[event] ??= []).push(handler);
    }),
    // Returns the first handler's result (there's only ever one handler per
    // event in these tests) so call sites don't need array-index gymnastics.
    fire: (event: string, e: unknown, c: unknown): unknown => (handlers[event] ?? []).map((h) => h(e, c))[0],
  };
}

const providerId = "vyceai";
const ctx = { model: { provider: providerId, id: "deepseek-v4-flash" } };

describe("installOverflowRewriter", () => {
  it("rewrites a matching overflow error into Pi's recognized format", () => {
    const pi = fakePi();
    installOverflowRewriter(pi as never, providerId, DEFAULT_OVERFLOW_PATTERNS);

    const message = {
      role: "assistant",
      stopReason: "error",
      provider: providerId,
      errorMessage: "Error: context length exceeded for this request",
    };
    const result = pi.fire("message_end", { message }, ctx) as { message: { errorMessage: string } } | undefined;

    expect(result?.message.errorMessage).toBe(
      "context_length_exceeded: Error: context length exceeded for this request",
    );
  });

  it("is idempotent - does not double-rewrite an already-normalized message", () => {
    const pi = fakePi();
    installOverflowRewriter(pi as never, providerId, DEFAULT_OVERFLOW_PATTERNS);

    const message = {
      role: "assistant",
      stopReason: "error",
      provider: providerId,
      errorMessage: "context_length_exceeded: context window exceeded",
    };
    const result = pi.fire("message_end", { message }, ctx);

    expect(result).toBeUndefined();
  });

  it("does NOT rewrite rate-limit / quota errors (must not hijack retry-with-backoff)", () => {
    const pi = fakePi();
    installOverflowRewriter(pi as never, providerId, DEFAULT_OVERFLOW_PATTERNS);

    const message = {
      role: "assistant",
      stopReason: "error",
      provider: providerId,
      errorMessage: "Too many requests. Please slow down and try again shortly.",
    };
    const result = pi.fire("message_end", { message }, ctx);

    expect(result).toBeUndefined();
  });

  it("ignores messages from a different provider", () => {
    const pi = fakePi();
    installOverflowRewriter(pi as never, providerId, DEFAULT_OVERFLOW_PATTERNS);

    const message = {
      role: "assistant",
      stopReason: "error",
      provider: "openai",
      errorMessage: "context length exceeded",
    };
    const result = pi.fire("message_end", { message }, { model: { provider: "openai" } });

    expect(result).toBeUndefined();
  });

  it("ignores non-error and non-assistant messages", () => {
    const pi = fakePi();
    installOverflowRewriter(pi as never, providerId, DEFAULT_OVERFLOW_PATTERNS);

    const okMessage = { role: "assistant", stopReason: "stop", provider: providerId, errorMessage: "" };
    const userMessage = { role: "user", stopReason: "error", provider: providerId, errorMessage: "context exceeded" };

    expect(pi.fire("message_end", { message: okMessage }, ctx)).toBeUndefined();
    expect(pi.fire("message_end", { message: userMessage }, ctx)).toBeUndefined();
  });
});
