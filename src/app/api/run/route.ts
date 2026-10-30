import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { runBlindspot } from "@/lib/agent/run";
import { missingKeys } from "@/lib/config";
import type { RunEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// One browser at a time keeps a small server (and the token budget) predictable.
let active = 0;
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_RUNS || 2);

const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) return ip === "::1" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith("::ffff:") && isPrivateAddress(ip.slice(7));
  return PRIVATE_V4.some((r) => r.test(ip));
}

async function resolveTarget(raw: string, origin: string): Promise<URL | null> {
  let url: URL;
  try {
    // Relative paths point at this app's own demo pages.
    url = raw.startsWith("/") ? new URL(raw, origin) : new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.origin === origin || process.env.ALLOW_PRIVATE_TARGETS === "1") return url;
  // Don't let a public deployment be used to browse the server's internal network.
  try {
    const addrs = await lookup(url.hostname, { all: true });
    if (addrs.some((a) => isPrivateAddress(a.address))) return null;
  } catch {
    return null;
  }
  return url;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { url?: string; task?: string };
  const task = (body.task ?? "").trim().slice(0, 500);
  const origin = process.env.PUBLIC_ORIGIN || new URL(req.url).origin;
  const target = await resolveTarget((body.url ?? "").trim(), origin);

  if (!target || !task) return Response.json({ error: "Give a public website URL and a task." }, { status: 400 });
  const missing = missingKeys().filter((k) => k === "NEBIUS_API_KEY");
  if (missing.length) return Response.json({ error: `Server is missing ${missing.join(", ")}.` }, { status: 500 });
  if (active >= MAX_CONCURRENT) {
    return Response.json({ error: "Blindspot is busy with other runs. Try again in a minute." }, { status: 429 });
  }

  active++;
  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: RunEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          abort.abort();
        }
      };
      try {
        await runBlindspot({ url: target.toString(), task, emit, signal: abort.signal });
      } finally {
        active--;
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
