// One tiny JSON call per role, to confirm each model answers and how fast.
import { z } from "zod";
import { chatJSON } from "../src/lib/llm";
for (const role of ["nano", "super", "ultra"] as const) {
  const t = Date.now();
  try {
    const r = await chatJSON({ role, purpose: "ping", system: "Reply with JSON only.", user: 'Return {"ok": true, "word": "<any word>"}', schema: z.object({ ok: z.boolean() }), thinking: false, maxTokens: 300 });
    console.log(role, "OK", JSON.stringify(r), Date.now() - t, "ms");
  } catch (e) { console.log(role, "FAIL", (e as Error).message.slice(0, 300)); }
}
