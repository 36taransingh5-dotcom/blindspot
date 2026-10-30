import { chromium, type Browser } from "playwright-core";
import { config } from "../config";
import type { ModelCall } from "../llm";
import type { RunEvent } from "../events";
import { findInvisibleClickables } from "../sr/screenreader";
import { runJourney } from "./journey";
import { diagnose, runAxe, writeFix } from "./report";

/** Full Chromium locally/in Docker; the compressed serverless build on Vercel. */
async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    const { default: serverless } = await import("@sparticuz/chromium");
    return chromium.launch({
      args: [...serverless.args, "--force-renderer-accessibility"],
      executablePath: await serverless.executablePath(),
      headless: true,
    });
  }
  return chromium.launch({ args: ["--force-renderer-accessibility"] });
}

export async function runBlindspot(opts: {
  url: string;
  task: string;
  emit: (e: RunEvent) => void;
  signal?: AbortSignal;
  maxSteps?: number;
}) {
  const started = Date.now();
  const { emit } = opts;
  const onCall = (call: ModelCall) => emit({ type: "call", call });
  let browser: Browser | null = null;

  try {
    emit({ type: "start", url: opts.url, task: opts.task, models: config.models });
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

    const journey = await runJourney({
      page,
      task: opts.task,
      maxSteps: opts.maxSteps ?? config.maxSteps,
      emit,
      onCall,
      signal: opts.signal,
      // Leave time for audit, diagnosis and fixes inside the host's request limit.
      deadline: started + config.journeyBudgetMs,
    });
    emit({ type: "journey", outcome: journey.outcome, reason: journey.reason, steps: journey.steps });
    if (opts.signal?.aborted) return;

    emit({ type: "phase", phase: "auditing", label: "Running axe-core and scanning for mouse-only controls" });
    const [axe, invisible] = await Promise.all([
      runAxe(page).catch(() => []),
      findInvisibleClickables(page).catch(() => []),
    ]);
    emit({ type: "axe", violations: axe });
    emit({ type: "invisible", items: invisible });

    emit({ type: "phase", phase: "diagnosing", label: "Nemotron Ultra is diagnosing the session" });
    const diagnosis = await diagnose({
      task: opts.task,
      outcome: journey.outcome,
      reason: journey.reason,
      trace: journey.trace,
      axe,
      invisible,
      evidenceHtml: journey.evidenceHtml,
      onCall,
    });
    emit({ type: "diagnosis", ...diagnosis });

    emit({ type: "phase", phase: "fixing", label: "Searching W3C guidance with Tavily and writing fixes with Nemotron Super" });
    await Promise.all(
      diagnosis.blockers.slice(0, 4).map(async (b) => {
        try {
          emit({ type: "fix", fix: await writeFix(b, onCall) });
        } catch (err) {
          emit({ type: "error", message: `Could not write a fix for "${b.title}": ${(err as Error).message}` });
        }
      }),
    );
    emit({ type: "done", durationMs: Date.now() - started });
  } catch (err) {
    emit({ type: "error", message: (err as Error).message ?? String(err) });
  } finally {
    await browser?.close().catch(() => {});
  }
}
