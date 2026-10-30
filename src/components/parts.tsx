"use client";

import { useEffect, useRef } from "react";
import type { ModelRole } from "@/lib/config";
import type { ModelCall } from "@/lib/llm";
import type { AgentAction, AxeViolation, Blocker, Fix, StepEvent } from "@/lib/events";
import type { InvisibleClickable } from "@/lib/sr/screenreader";
import type { Phase, RunState } from "@/lib/useRun";

const ROLE_LABEL: Record<ModelRole, string> = { nano: "Nemotron Nano", super: "Nemotron Super", ultra: "Nemotron Ultra" };
const ROLE_COLOR: Record<ModelRole, string> = { nano: "bg-nano", super: "bg-super", ultra: "bg-ultra" };
const ROLE_JOB: Record<ModelRole, string> = {
  nano: "Drives the keyboard, one decision per step",
  ultra: "Diagnoses why the journey failed, maps to WCAG",
  super: "Writes the code fixes from W3C guidance",
};

export function ModelBadge({ role, className = "" }: { role: ModelRole; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-panel-2 px-2 py-0.5 text-[11px] font-medium text-muted ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ROLE_COLOR[role]}`} aria-hidden="true" />
      {ROLE_LABEL[role]}
    </span>
  );
}

function keyGlyph(key: string) {
  return ({ Tab: "⇥ Tab", "Shift+Tab": "⇤ Shift+Tab", Enter: "↵ Enter", Space: "␣ Space", Escape: "Esc", ArrowDown: "↓", ArrowUp: "↑", ArrowLeft: "←", ArrowRight: "→" } as Record<string, string>)[key] ?? key;
}

export function ActionChip({ action }: { action: AgentAction }) {
  const base = "inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-semibold";
  switch (action.kind) {
    case "start": return <span className={`${base} bg-panel-2 text-muted`}>page loaded</span>;
    case "press": return <kbd className={`${base} border border-line bg-panel-2 text-text`}>{keyGlyph(action.key)}</kbd>;
    case "type": return <span className={`${base} bg-panel-2 text-text`}>typed “{action.text}”</span>;
    case "focus": return <span className={`${base} bg-panel-2 text-text`}>jump → {action.label}</span>;
    case "finish": return action.success
      ? <span className={`${base} bg-ok/15 text-ok`}>✓ task done</span>
      : <span className={`${base} bg-bad/15 text-bad`}>✕ gave up</span>;
  }
}

/** The page as a sighted person would see it, with the screen reader's focus drawn on top. */
export function Screen({ step, live }: { step: StepEvent | null; live: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-line" />
          <span className="h-2.5 w-2.5 rounded-full bg-line" />
          <span className="h-2.5 w-2.5 rounded-full bg-line" />
        </span>
        <span className="truncate rounded-md bg-panel-2 px-2 py-0.5 font-mono text-xs text-muted">{step?.url ?? "about:blank"}</span>
        {live && <span className="ml-auto flex items-center gap-1.5 text-xs text-focus"><span className="h-2 w-2 animate-pulse rounded-full bg-focus" aria-hidden="true" />live</span>}
      </div>
      <div className="relative aspect-[1280/800] w-full bg-black">
        {step ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={step.screenshot} alt={`Screenshot after step ${step.n}: ${step.title}`} className="absolute inset-0 h-full w-full object-cover object-top opacity-90" />
            {step.focusBox && (
              <div
                className="focus-ring pointer-events-none absolute rounded-md"
                style={{
                  left: `${(step.focusBox.x / 1280) * 100}%`,
                  top: `${(step.focusBox.y / 800) * 100}%`,
                  width: `${(step.focusBox.w / 1280) * 100}%`,
                  height: `${(step.focusBox.h / 800) * 100}%`,
                }}
                aria-hidden="true"
              />
            )}
          </>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted">Starting a browser…</div>
        )}
      </div>
    </div>
  );
}

export function Transcript({ steps, selected, onSelect, thinking }: { steps: StepEvent[]; selected: number | null; onSelect: (n: number) => void; thinking: boolean }) {
  const endRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (selected === null) endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [steps.length, selected]);

  return (
    <ol className="scrollbar-thin flex max-h-[min(70vh,640px)] flex-col gap-2 overflow-y-auto pr-1" aria-label="What the screen reader said">
      {steps.map((s) => {
        const isSel = selected === s.n;
        return (
          <li key={s.n} className="fade-up">
            <button
              type="button"
              onClick={() => onSelect(s.n)}
              aria-pressed={isSel}
              className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${isSel ? "border-focus bg-panel-2" : "border-line bg-panel hover:bg-panel-2"}`}
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-muted">#{s.n}</span>
                <ActionChip action={s.action} />
                {s.model && <ModelBadge role={s.model} className="ml-auto" />}
              </div>
              {s.spoken.map((line, i) => (
                <p key={i} className={`font-mono text-[15px] leading-snug ${line.startsWith("(no label)") ? "text-bad" : line.startsWith("(announced)") ? "text-super" : "text-text"}`}>
                  <span aria-hidden="true" className="mr-1.5 text-focus">🔊</span>
                  {line}
                </p>
              ))}
              {s.thought && <p className="mt-1.5 text-[13px] italic text-muted">“{s.thought}”</p>}
            </button>
          </li>
        );
      })}
      {thinking && (
        <li ref={endRef} className="flex items-center gap-2 px-3 py-2 text-sm text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-nano" aria-hidden="true" /> Nemotron Nano is deciding the next key press…
        </li>
      )}
      {!thinking && <li ref={endRef} aria-hidden="true" />}
    </ol>
  );
}

const PIPELINE: { key: Phase; label: string; who: string }[] = [
  { key: "journey", label: "Blind journey", who: "Nemotron Nano" },
  { key: "auditing", label: "Rule audit", who: "axe-core" },
  { key: "diagnosing", label: "Diagnosis", who: "Nemotron Ultra" },
  { key: "fixing", label: "Fixes", who: "Tavily + Nemotron Super" },
];
const ORDER: Phase[] = ["journey", "auditing", "diagnosing", "fixing", "done"];

export function Pipeline({ phase }: { phase: Phase }) {
  const at = ORDER.indexOf(phase);
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Pipeline progress">
      {PIPELINE.map((p, i) => {
        const state = phase === "error" ? "idle" : at > i ? "done" : at === i ? "active" : "idle";
        return (
          <li key={p.key} className={`rounded-xl border px-3 py-2 ${state === "active" ? "border-focus bg-panel-2" : "border-line bg-panel"}`} aria-current={state === "active" ? "step" : undefined}>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <span aria-hidden="true" className={state === "done" ? "text-ok" : state === "active" ? "text-focus" : "text-muted"}>
                {state === "done" ? "✓" : state === "active" ? "●" : "○"}
              </span>
              {p.label}
              <span className="sr-only">{state === "done" ? "(done)" : state === "active" ? "(in progress)" : ""}</span>
            </p>
            <p className="text-xs text-muted">{p.who}</p>
          </li>
        );
      })}
    </ol>
  );
}

export function JourneyBanner({ journey }: { journey: NonNullable<RunState["journey"]> }) {
  const ok = journey.outcome === "completed";
  return (
    <div role="status" className={`fade-up rounded-2xl border p-5 ${ok ? "border-ok/40 bg-ok/10" : "border-bad/40 bg-bad/10"}`}>
      <p className={`text-xs font-bold uppercase tracking-widest ${ok ? "text-ok" : "text-bad"}`}>
        {ok ? "Journey completed" : journey.outcome === "blocked" ? "Journey blocked" : "Journey abandoned"}
      </p>
      <p className="mt-1 text-2xl font-bold">
        {ok ? `A blind user finished the task in ${journey.steps} steps.` : `A blind user got stuck after ${journey.steps} steps.`}
      </p>
      {journey.reason && <p className="mt-2 text-muted">“{journey.reason}”</p>}
    </div>
  );
}

function Code({ children, tone }: { children: string; tone: "bad" | "ok" }) {
  return (
    <pre className={`scrollbar-thin overflow-x-auto rounded-lg border p-3 font-mono text-[12.5px] leading-relaxed ${tone === "bad" ? "border-bad/30 bg-bad/5" : "border-ok/30 bg-ok/5"}`}>
      <code>{children}</code>
    </pre>
  );
}

const SEV: Record<Blocker["severity"], string> = { blocker: "bg-bad text-ink", serious: "bg-warn text-ink", moderate: "bg-panel-2 text-text border border-line" };

export function BlockerCard({ b, fix, fixing }: { b: Blocker; fix?: Fix; fixing: boolean }) {
  return (
    <article className="fade-up rounded-2xl border border-line bg-panel p-5" aria-labelledby={`${b.id}-t`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase ${SEV[b.severity]}`}>{b.severity}</span>
        <span className="rounded-md border border-line px-2 py-0.5 font-mono text-xs text-muted">WCAG {b.wcag}</span>
        {b.evidenceStep != null && <span className="font-mono text-xs text-muted">seen at step #{b.evidenceStep}</span>}
      </div>
      <h3 id={`${b.id}-t`} className="mt-2 text-lg font-bold">{b.title}</h3>
      {b.heard && <p className="mt-2 font-mono text-[14px] text-focus"><span aria-hidden="true">🔊 </span>{b.heard}</p>}
      <p className="mt-2 text-[15px] text-muted">{b.why}</p>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-bad">Before</p>
          {b.html ? <Code tone="bad">{b.html}</Code> : <p className="text-sm text-muted">No exact snippet captured for this issue.</p>}
        </div>
        <div>
          <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ok">After <ModelBadge role="super" /></p>
          {fix ? <Code tone="ok">{fix.after}</Code> : <p className="text-sm text-muted">{fixing ? "Writing the fix…" : "No fix generated."}</p>}
        </div>
      </div>
      {fix && (
        <div className="mt-3 text-[14px] text-muted">
          <p>{fix.explanation}</p>
          {fix.source && (
            <p className="mt-1.5">
              Based on: <a className="text-focus underline underline-offset-2" href={fix.source.url} target="_blank" rel="noreferrer">{fix.source.title}</a>
              <span className="ml-1.5 text-xs">(found with Tavily)</span>
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export function AxeList({ axe, invisible }: { axe: AxeViolation[]; invisible: InvisibleClickable[] | null }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <h3 className="font-bold">Rule checks <span className="font-normal text-muted">(axe-core, no AI)</span></h3>
      {invisible && invisible.length > 0 && (
        <p className="mt-2 text-sm"><span className="font-bold text-bad">{invisible.length}</span> mouse-only control{invisible.length === 1 ? "" : "s"}: clickable for a mouse, invisible to a keyboard.</p>
      )}
      {axe.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No WCAG rule violations found on the final page.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {axe.slice(0, 10).map((v) => (
            <li key={v.id} className="text-sm">
              <span className={`mr-2 font-mono text-xs ${v.impact === "critical" || v.impact === "serious" ? "text-bad" : "text-warn"}`}>{v.impact}</span>
              <a href={v.helpUrl} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2 hover:text-focus">{v.help}</a>
              <span className="text-muted"> ×{v.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Ledger({ calls, models }: { calls: ModelCall[]; models: Record<ModelRole, string> | null }) {
  const roles: ModelRole[] = ["nano", "ultra", "super"];
  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <h3 className="font-bold">Which model did what <span className="font-normal text-muted">(Nebius Token Factory)</span></h3>
      <ul className="mt-3 flex flex-col gap-3">
        {roles.map((r) => {
          const mine = calls.filter((c) => c.role === r);
          const avg = mine.length ? Math.round(mine.reduce((a, c) => a + c.ms, 0) / mine.length) : 0;
          const tokens = mine.reduce((a, c) => a + c.promptTokens + c.completionTokens, 0);
          return (
            <li key={r}>
              <div className="flex items-center justify-between gap-2">
                <ModelBadge role={r} />
                <span className="font-mono text-xs text-muted">{mine.length} call{mine.length === 1 ? "" : "s"}{mine.length ? ` · ${avg} ms avg · ${tokens.toLocaleString()} tok` : ""}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{ROLE_JOB[r]}</p>
              {models && <p className="mt-0.5 truncate font-mono text-[11px] text-muted/70">{models[r]}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
