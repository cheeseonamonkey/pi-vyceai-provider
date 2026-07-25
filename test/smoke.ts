// Minimal real end-to-end smoke test against the live Vyce AI API.
// Requires VYCEAI_API_KEY (or VYCEAI_SMOKE_KEY as a fallback, for CI secrets
// naming). Not run as part of `npm test` - intentionally gated behind a real
// network call and a real key, run manually or via CI on tagged releases.
const key = process.env.VYCEAI_API_KEY ?? process.env.VYCEAI_SMOKE_KEY;

if (!key) {
  console.error("smoke: no VYCEAI_API_KEY / VYCEAI_SMOKE_KEY set, skipping.");
  process.exit(1);
}

const baseUrl = "https://vyceai.com/v1";

async function main() {
  console.log("smoke: GET /models ...");
  const modelsResp = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!modelsResp.ok) {
    throw new Error(`/models failed: HTTP ${modelsResp.status}`);
  }
  const modelsPayload = (await modelsResp.json()) as { data?: Array<{ id: string }> };
  if (!Array.isArray(modelsPayload?.data) || modelsPayload.data.length === 0) {
    throw new Error("/models returned no data");
  }
  console.log(`smoke: /models OK (${modelsPayload.data.length} models)`);

  console.log("smoke: POST /chat/completions (deepseek-v4-flash, max_tokens=10) ...");
  const chatResp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "Reply with the single word: pong" }],
      max_tokens: 10,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!chatResp.ok) {
    throw new Error(`/chat/completions failed: HTTP ${chatResp.status}`);
  }
  const chatPayload = (await chatResp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = chatPayload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("/chat/completions returned no message content");
  }
  console.log(`smoke: /chat/completions OK - response: ${JSON.stringify(content)}`);
  console.log("smoke: PASSED");
}

main().catch((err) => {
  console.error("smoke: FAILED -", err instanceof Error ? err.message : err);
  process.exit(1);
});
