import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { createProvider } from "../src/provider.js";
import type { ModelMeta } from "../src/types.js";

function fakePi() {
  return {
    on: jest.fn(),
    registerProvider: jest.fn(),
  };
}

const staticModels: Record<string, ModelMeta> = {
  "model-a": {
    id: "model-a",
    name: "Model A",
    reasoning: false,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 4_096,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    toolCalls: true,
  },
};

const baseCfg = {
  providerId: "vyceai",
  name: "Vyce AI",
  baseUrl: "https://example.invalid/v1",
  apiKeyEnv: "VYCEAI_TEST_KEY",
  staticModels,
  overflowPatterns: [],
  // Hermetic by default: never touch the real auth.json of whoever runs these.
  readStoredKey: () => undefined,
};

describe("createProvider", () => {
  const originalEnv = process.env.VYCEAI_TEST_KEY;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.VYCEAI_TEST_KEY;
    else process.env.VYCEAI_TEST_KEY = originalEnv;
  });

  it("skips the network call entirely and falls back to the static table when no key is configured", async () => {
    delete process.env.VYCEAI_TEST_KEY;
    const pi = fakePi();
    const fetchImpl = jest.fn();

    await createProvider(pi as never, { ...baseCfg, fetchImpl: fetchImpl as never });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(pi.registerProvider).toHaveBeenCalledTimes(1);
    const [, config] = pi.registerProvider.mock.calls[0] as [string, { models: Array<{ id: string }> }];
    expect(config.models.map((m) => m.id)).toEqual(["model-a"]);
  });

  it("discovers models using the key Pi stored via /login when the env var is unset", async () => {
    delete process.env.VYCEAI_TEST_KEY;
    const pi = fakePi();
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: "model-a" }, { id: "model-remote" }] }),
    })) as unknown as typeof fetch;

    await createProvider(pi as never, {
      ...baseCfg,
      fetchImpl,
      readStoredKey: () => "sk-from-login",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://example.invalid/v1/models");
    expect(init.headers.Authorization).toBe("Bearer sk-from-login");
    const [, config] = pi.registerProvider.mock.calls[0] as [string, { models: Array<{ id: string }> }];
    expect(config.models.map((m) => m.id)).toEqual(["model-a", "model-remote"]);
  });

  it("prefers the env var over the stored credential", async () => {
    process.env.VYCEAI_TEST_KEY = "sk-from-env";
    const pi = fakePi();
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: "model-a" }] }),
    })) as unknown as typeof fetch;

    await createProvider(pi as never, {
      ...baseCfg,
      fetchImpl,
      readStoredKey: () => "sk-from-login",
    });

    const [, init] = (fetchImpl as jest.Mock).mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers.Authorization).toBe("Bearer sk-from-env");
  });

  it("falls back to the static table when the fetch fails", async () => {
    process.env.VYCEAI_TEST_KEY = "sk-test";
    const pi = fakePi();
    const fetchImpl = jest.fn(async () => {
      throw new Error("network down");
    });

    await createProvider(pi as never, { ...baseCfg, fetchImpl: fetchImpl as never });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, config] = pi.registerProvider.mock.calls[0] as [string, { models: Array<{ id: string }> }];
    expect(config.models.map((m) => m.id)).toEqual(["model-a"]);
  });

  it("falls back to the static table on a non-OK response", async () => {
    process.env.VYCEAI_TEST_KEY = "sk-test";
    const pi = fakePi();
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 401 })) as unknown as typeof fetch;

    await createProvider(pi as never, { ...baseCfg, fetchImpl });

    const [, config] = pi.registerProvider.mock.calls[0] as [string, { models: Array<{ id: string }> }];
    expect(config.models.map((m) => m.id)).toEqual(["model-a"]);
  });

  it("uses the live model list when the fetch succeeds", async () => {
    process.env.VYCEAI_TEST_KEY = "sk-test";
    const pi = fakePi();
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: "model-a" }, { id: "model-b-not-in-static" }] }),
    })) as unknown as typeof fetch;

    await createProvider(pi as never, { ...baseCfg, fetchImpl });

    const [, config] = pi.registerProvider.mock.calls[0] as [string, { models: Array<{ id: string }> }];
    expect(config.models.map((m) => m.id).sort()).toEqual(["model-a", "model-b-not-in-static"]);
  });

  it("resolves within the timeout budget when fetch hangs (mimics real AbortSignal behavior)", async () => {
    process.env.VYCEAI_TEST_KEY = "sk-test";
    const pi = fakePi();
    // Real `fetch` rejects when its AbortSignal fires. A bare hung Promise
    // would not, since our own code's timeout is expressed entirely via the
    // signal it passes in - so the mock must honor `init.signal` the same
    // way native fetch does, or this test would hang instead of proving
    // anything about our timeout handling.
    const fetchImpl = jest.fn((_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }) as unknown as typeof fetch;

    const start = Date.now();
    await createProvider(pi as never, { ...baseCfg, fetchImpl, fetchTimeoutMs: 50 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000); // generous CI margin over the 50ms budget
    const [, config] = pi.registerProvider.mock.calls[0] as [string, { models: Array<{ id: string }> }];
    expect(config.models.map((m) => m.id)).toEqual(["model-a"]);
  });
});
