import { z } from "zod";
import AxeBuilder from "@axe-core/playwright";
import { tavily } from "@tavily/core";
import type { Page } from "playwright-core";
import { config } from "../config";
import { chatJSON, type ModelCall } from "../llm";
import type { InvisibleClickable } from "../sr/screenreader";
import type { AxeViolation, Blocker, Fix, Outcome } from "../events";

/** Deterministic WCAG rule checks. Results come from axe-core, not a model. */
export async function runAxe(page: Page): Promise<AxeViolation[]> {
  const res = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 } as Record<string, number>;
  return res.violations
    .map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      help: v.help,
      helpUrl: v.helpUrl,
      wcag: v.tags.filter((t) => /^wcag\d{3,4}$/.test(t)).map((t) => t.replace(/^wcag(\d)(\d)(\d+)$/, "$1.$2.$3")),
      count: v.nodes.length,
      sample: (v.nodes[0]?.html ?? "").slice(0, 300),
    }))
    .sort((a, b) => (order[a.impact ?? "minor"] ?? 4) - (order[b.impact ?? "minor"] ?? 4));
}

const Diagnosis = z.object({
  verdict: z.string(),
  explanation: z.string(),
  blockers: z
    .array(
      z.object({
        title: z.string(),
        severity: z.enum(["blocker", "serious", "moderate"]).catch("serious"),
        wcag: z.string(),
        heard: z.string().default(""),
        why: z.string(),
        evidenceStep: z.number().int().nullable().optional(),
        html: z.string().nullable().optional(),
        searchQuery: z.string(),
      }),
    )
    .max(6),
});

const DIAGNOSE_SYSTEM = `You are an expert accessibility engineer reviewing a recorded screen reader session.
A simulated blind user (keyboard + screen reader only) attempted a task. You get the step-by-step trace of what they did and heard,
plus deterministic findings from axe-core and a scan for mouse-only clickable elements.

Explain WHY the journey succeeded or failed, in terms a developer can act on. Reply with JSON only:
{"verdict": "<one punchy sentence a product manager would understand, e.g. 'A blind user cannot buy a ticket: the Find tickets control is a div that keyboards cannot reach.'>",
 "explanation": "<2-4 sentences connecting what the user heard to the root causes>",
 "blockers": [ {"title": "<short>", "severity": "blocker"|"serious"|"moderate",
   "wcag": "<success criterion number and name, e.g. '2.1.1 Keyboard'>",
   "heard": "<what the screen reader said (or failed to say) at that moment, quoted from the trace>",
   "why": "<root cause in the markup>",
   "evidenceStep": <step number from the trace, or null>,
   "html": "<the offending element's HTML copied VERBATIM from the trace or findings, or null if none was captured>",
   "searchQuery": "<web search query to find the authoritative W3C/MDN technique for fixing this>"} ]}

Rules: order blockers by how much they stopped THIS task (journey blockers first, then other serious issues). At most 5.
Never invent HTML; copy it exactly or use null. If the journey completed, still list the most serious remaining issues.`;

export async function diagnose(opts: {
  task: string;
  outcome: Outcome;
  reason: string;
  trace: string[];
  axe: AxeViolation[];
  invisible: InvisibleClickable[];
  evidenceHtml: string[];
  onCall: (c: ModelCall) => void;
}): Promise<{ verdict: string; explanation: string; blockers: Blocker[] }> {
  const axeText = opts.axe
    .slice(0, 12)
    .map((v) => `- [${v.impact}] ${v.id}: ${v.help} (WCAG ${v.wcag.join(", ") || "n/a"}; ${v.count} element(s)); e.g. ${v.sample}`)
    .join("\n");
  const invText = opts.invisible.map((i) => `- "${i.text}": ${i.html}`).join("\n");

  const d = await chatJSON({
    role: "ultra",
    purpose: "diagnose why the journey failed and map to WCAG",
    system: DIAGNOSE_SYSTEM,
    user: `Task: ${opts.task}
Outcome: ${opts.outcome}${opts.reason ? ` (user said: ${opts.reason})` : ""}

Screen reader session trace:
${opts.trace.join("\n").slice(0, 14000)}

axe-core violations on the final page:
${axeText || "(none)"}

Mouse-only clickable elements (pointer cursor, no role, not focusable):
${invText || "(none)"}`,
    schema: Diagnosis,
    thinking: true,
    maxTokens: 6000,
    onCall: opts.onCall,
  });

  // Keep the model honest: an HTML snippet survives only if it really appeared in the evidence.
  const corpus = [opts.trace.join("\n"), ...opts.evidenceHtml, ...opts.axe.map((v) => v.sample), ...opts.invisible.map((i) => i.html)].join("\n");
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const normCorpus = norm(corpus);

  return {
    verdict: d.verdict,
    explanation: d.explanation,
    blockers: d.blockers.map((b, i) => ({
      id: `b${i + 1}`,
      title: b.title,
      severity: b.severity,
      wcag: b.wcag,
      heard: b.heard,
      why: b.why,
      evidenceStep: b.evidenceStep ?? null,
      html: b.html && normCorpus.includes(norm(b.html)) ? b.html : null,
      searchQuery: b.searchQuery,
    })),
  };
}

const FixSchema = z.object({
  after: z.string(),
  explanation: z.string(),
  sourceUrl: z.string().nullable().optional(),
});

type Source = { title: string; url: string; content: string };

async function searchGuidance(query: string): Promise<Source[]> {
  if (!config.tavilyApiKey) return [];
  const client = tavily({ apiKey: config.tavilyApiKey });
  const res = await client.search(query, {
    maxResults: 3,
    searchDepth: "basic",
    includeDomains: ["w3.org", "developer.mozilla.org", "webaim.org"],
  });
  return res.results.map((r) => ({ title: r.title, url: r.url, content: r.content.slice(0, 900) }));
}

export async function writeFix(blocker: Blocker, onCall: (c: ModelCall) => void): Promise<Fix> {
  const sources = await searchGuidance(blocker.searchQuery).catch(() => [] as Source[]);
  const sourceText = sources.map((s, i) => `[${i + 1}] ${s.title} (${s.url})\n${s.content}`).join("\n\n");

  const fix = await chatJSON({
    role: "super",
    purpose: `write fix for "${blocker.title}"`,
    system: `You are a senior front-end engineer fixing an accessibility bug. Reply with JSON only:
{"after": "<corrected HTML (and minimal JS if strictly needed), ready to paste>", "explanation": "<2 sentences: what changed and how a screen reader user now experiences it>", "sourceUrl": "<the URL of the guidance you followed, chosen from the sources, or null>"}
Prefer native HTML elements over ARIA. Keep the original text, ids, classes and handlers where possible.`,
    user: `Problem: ${blocker.title} (WCAG ${blocker.wcag})
What the user heard: ${blocker.heard}
Root cause: ${blocker.why}
Offending HTML: ${blocker.html ?? "(not captured; write a minimal representative fix)"}

Guidance found via search:
${sourceText || "(no search results; rely on WCAG knowledge)"}`,
    schema: FixSchema,
    thinking: false,
    maxTokens: 1500,
    onCall,
  });

  const chosen = sources.find((s) => s.url === fix.sourceUrl) ?? sources[0] ?? null;
  return {
    blockerId: blocker.id,
    after: fix.after,
    explanation: fix.explanation,
    source: chosen ? { title: chosen.title, url: chosen.url } : null,
  };
}
