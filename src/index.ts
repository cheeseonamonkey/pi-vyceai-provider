import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_OVERFLOW_PATTERNS } from "./overflow.js";
import { createProvider } from "./provider.js";
import { STATIC_MODELS } from "./vyceai.models.js";

// `/reload` spawns a fresh extension instance (safe by itself - a new
// module scope). This guard only protects against a double factory
// invocation within a single process (e.g. a misconfigured extensions list
// importing this module twice), which would otherwise accumulate duplicate
// `pi.on` listeners and re-run `registerProvider` redundantly.
let installed = false;

export default async function vyceAiExtension(pi: ExtensionAPI): Promise<void> {
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
