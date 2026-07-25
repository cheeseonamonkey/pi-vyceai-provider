import { type ExtensionAPI, type ProviderModelConfig, readStoredCredential } from "@earendil-works/pi-coding-agent";
import { installModelWarnings } from "./modelWarnings.js";
import { installNoToolsGuard } from "./noToolsGuard.js";
import { installOverflowRewriter } from "./overflow.js";
import type { ModelMeta } from "./types.js";

export interface CreateProviderConfig {
  providerId: string;
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
  staticModels: Record<string, ModelMeta>;
  overflowPatterns: RegExp[];
  /** Overridable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Overridable for tests; defaults to 5000ms. */
  fetchTimeoutMs?: number;
  /** Overridable for tests; defaults to reading Pi's auth.json. */
  readStoredKey?: (providerId: string) => string | undefined;
}

/**
 * Generic helper for registering an OpenAI-compatible proxy provider with
 * Pi. Deliberately provider-agnostic - only knows providerId/name/baseUrl/
 * apiKeyEnv/staticModels/overflowPatterns - so it can be reused for any other
 * OpenAI-compatible provider by swapping in a different models table and a
 * 2-line index.ts.
 */
export async function createProvider(pi: ExtensionAPI, cfg: CreateProviderConfig): Promise<void> {
  const { providerId, name, baseUrl, apiKeyEnv, staticModels, overflowPatterns } = cfg;
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const fetchTimeoutMs = cfg.fetchTimeoutMs ?? 5000;

  // The extension factory runs on EVERY `pi` invocation (including
  // `pi --list-models`, `-p` print mode, RPC) because global extensions load
  // at startup and pi awaits the factory Promise before continuing. A slow
  // or broken network call here would stall ALL of pi for every user, even
  // ones who never touch this provider this session. Skip the network call
  // entirely when no key is configured, and never let a fetch failure
  // escape this function - always fall back to the static table.
  const readStoredKey = cfg.readStoredKey ?? readStoredApiKey;
  const apiKey = process.env[apiKeyEnv] ?? readStoredKey(providerId);
  const remoteIds = apiKey
    ? await fetchModelIdsWithTimeout(fetchImpl, baseUrl, apiKey, fetchTimeoutMs).catch(() => [] as string[])
    : [];

  const usableStatic = Object.entries(staticModels).filter(([, meta]) => meta.status !== "removed");
  const allIds = remoteIds.length ? remoteIds : usableStatic.map(([id]) => id);

  const noToolsModels = new Set(
    allIds.filter((id) => (staticModels[id]?.toolCalls ?? true) === false),
  );

  const models: ProviderModelConfig[] = allIds.map((id) => {
    const meta = staticModels[id] ?? fallbackMeta(id);
    return {
      id: meta.id,
      name: meta.name,
      // Always false in v0.1 regardless of the static table's marketing
      // claims - Vyce AI never exposes a separate reasoning/thinking stream,
      // so Pi's thinking-level UI would be a no-op if enabled. See
      // KNOWN_ISSUES.md.
      reasoning: false,
      input: meta.input,
      contextWindow: meta.contextWindow,
      maxTokens: meta.maxTokens,
      cost: meta.cost,
      // `compat` is a per-model field (not a top-level ProviderConfig field).
      // Thin proxy - send system role, not developer, and don't rely on
      // reasoning_effort support (defensive; unused while reasoning:false).
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
      },
    };
  });

  pi.registerProvider(providerId, {
    name,
    baseUrl,
    apiKey: `$${apiKeyEnv}`,
    authHeader: true,
    api: "openai-completions",
    models,
  });

  installNoToolsGuard(pi, providerId, noToolsModels);
  installOverflowRewriter(pi, providerId, overflowPatterns);
  installModelWarnings(pi, providerId, staticModels);
}

/**
 * Read the api key Pi stored via `/login` (auth.json), for users who never set
 * the env var. Without this, discovery is skipped entirely for them and they
 * silently get the static table forever - requests still work, since Pi
 * resolves `apiKey: "$ENV"` itself, so the failure is invisible.
 *
 * Sync file read on the startup path: cheap (small JSON), but never allowed to
 * throw - a corrupt or unreadable auth.json degrades to the static table, same
 * as a failed fetch.
 */
function readStoredApiKey(providerId: string): string | undefined {
  try {
    const cred = readStoredCredential(providerId);
    return cred?.type === "api_key" ? cred.key : undefined;
  } catch {
    return undefined;
  }
}

async function fetchModelIdsWithTimeout(
  fetchImpl: typeof fetch,
  baseUrl: string,
  apiKey: string,
  timeoutMs: number,
): Promise<string[]> {
  const resp = await fetchImpl(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs), // single attempt, no retry/backoff in the startup path
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const payload = (await resp.json()) as { data?: Array<{ id: string }> };
  if (!Array.isArray(payload?.data)) throw new Error("Unexpected /models response shape");
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
    toolCalls: true, // matches the guard's `?? true` default: unknown remote models are treated as tool-capable (no evidence of rejection; live test found zero 400s on `tools`).
  };
}
