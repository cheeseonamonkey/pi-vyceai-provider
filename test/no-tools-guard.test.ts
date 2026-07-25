import { describe, expect, it, jest } from "@jest/globals";
import { installNoToolsGuard } from "../src/noToolsGuard.js";

function fakePi() {
  const handlers: Record<string, Array<(event: unknown, ctx: unknown) => unknown>> = {};
  return {
    on: jest.fn((event: string, handler: (e: unknown, c: unknown) => unknown) => {
      (handlers[event] ??= []).push(handler);
    }),
    fire: (event: string, e: unknown, c: unknown): unknown => (handlers[event] ?? []).map((h) => h(e, c))[0],
  };
}

const providerId = "vyceai";

describe("installNoToolsGuard", () => {
  it("strips tools/tool_choice for models in the no-tools set", () => {
    const pi = fakePi();
    installNoToolsGuard(pi as never, providerId, new Set(["some-model"]));

    const payload = { model: "some-model", messages: [], tools: [{ type: "function" }], tool_choice: "auto" };
    const result = pi.fire(
      "before_provider_request",
      { payload },
      { model: { provider: providerId, id: "some-model" } },
    ) as Record<string, unknown> | undefined;

    expect(result).toBeDefined();
    expect(result).not.toHaveProperty("tools");
    expect(result).not.toHaveProperty("tool_choice");
    expect(result?.messages).toEqual([]); // other fields preserved
  });

  it("leaves the payload untouched for models NOT in the no-tools set", () => {
    const pi = fakePi();
    installNoToolsGuard(pi as never, providerId, new Set(["some-model"]));

    const payload = { model: "other-model", tools: [{ type: "function" }] };
    const result = pi.fire(
      "before_provider_request",
      { payload },
      { model: { provider: providerId, id: "other-model" } },
    );

    expect(result).toBeUndefined();
  });

  it("leaves payloads for a different provider untouched, even with a matching model id", () => {
    const pi = fakePi();
    installNoToolsGuard(pi as never, providerId, new Set(["some-model"]));

    const payload = { model: "some-model", tools: [{ type: "function" }] };
    const result = pi.fire(
      "before_provider_request",
      { payload },
      { model: { provider: "some-other-provider", id: "some-model" } },
    );

    expect(result).toBeUndefined();
  });

  it("is a no-op when the payload has neither tools nor tool_choice", () => {
    const pi = fakePi();
    installNoToolsGuard(pi as never, providerId, new Set(["some-model"]));

    const payload = { model: "some-model", messages: [] };
    const result = pi.fire(
      "before_provider_request",
      { payload },
      { model: { provider: providerId, id: "some-model" } },
    );

    expect(result).toBeUndefined();
  });
});
