// Lists the NVIDIA models your Token Factory key can call, so MODEL_* in .env.local can be set exactly.
// Usage: npm run models
import OpenAI from "openai";

const key = process.env.NEBIUS_API_KEY;
if (!key) {
  console.error("NEBIUS_API_KEY is not set. Put it in .env.local first.");
  process.exit(1);
}
const client = new OpenAI({ apiKey: key, baseURL: process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/" });
const ids: string[] = [];
for await (const m of client.models.list()) ids.push(m.id);
const nvidia = ids.filter((id) => /nvidia|nemotron/i.test(id)).sort();
console.log(`${ids.length} models available; ${nvidia.length} from NVIDIA:\n`);
for (const id of nvidia) console.log("  " + id);
for (const role of ["MODEL_NANO", "MODEL_SUPER", "MODEL_ULTRA"]) {
  const v = process.env[role];
  console.log(`\n${role}=${v ?? "(unset)"} ${v && ids.includes(v) ? "✓ available" : "✗ NOT in your model list"}`);
}
