// Fetches live /v1/models and diffs against src/vyceai.models.ts, WITHOUT
// overwriting existing metadata (pricing, context window, toolCalls, etc.
// aren't available from the API - see KNOWN_ISSUES.md "Pricing accuracy").
// Never auto-edits the file: prints a report only. A human reviews and
// updates src/vyceai.models.ts by hand, since new entries need real pricing
// research before they're useful.
import { STATIC_MODELS } from "../src/vyceai.models.js";

const key = process.env.VYCEAI_API_KEY ?? process.env.VYCEAI_SMOKE_KEY;
const baseUrl = "https://vyceai.com/v1";

async function main() {
  if (!key) {
    console.error("sync-models: no VYCEAI_API_KEY / VYCEAI_SMOKE_KEY set.");
    process.exit(1);
  }

  const resp = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) {
    throw new Error(`/models failed: HTTP ${resp.status}`);
  }
  const payload = (await resp.json()) as { data?: Array<{ id: string }> };
  if (!Array.isArray(payload?.data)) {
    throw new Error("/models returned an unexpected shape");
  }

  const liveIds = new Set(payload.data.map((m) => m.id));
  const staticIds = new Set(
    Object.entries(STATIC_MODELS)
      .filter(([, meta]) => meta.status !== "removed")
      .map(([id]) => id),
  );

  const added = [...liveIds].filter((id) => !staticIds.has(id));
  const removed = [...staticIds].filter((id) => !liveIds.has(id));

  console.log(`sync-models: live=${liveIds.size} static(non-removed)=${staticIds.size}`);

  if (added.length === 0 && removed.length === 0) {
    console.log("sync-models: no drift detected.");
    return;
  }

  if (added.length > 0) {
    console.warn(`\n⚠️  New model(s) on Vyce AI not yet in src/vyceai.models.ts:`);
    for (const id of added) console.warn(`   - ${id}`);
    console.warn(`   Add an entry with real pricing/context-window before using it.`);
  }

  if (removed.length > 0) {
    console.warn(`\n⚠️  Model(s) in src/vyceai.models.ts no longer returned by /v1/models:`);
    for (const id of removed) console.warn(`   - ${id}`);
    console.warn(`   Consider setting status: "removed" (keeps history, stops registration).`);
  }

  process.exitCode = 1; // signal drift to CI without throwing
}

main().catch((err) => {
  console.error("sync-models: FAILED -", err instanceof Error ? err.message : err);
  process.exit(1);
});
