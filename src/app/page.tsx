"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRun } from "@/lib/useRun";
import type { StepEvent } from "@/lib/events";
import { AxeList, BlockerCard, JourneyBanner, Ledger, ModelBadge, Pipeline, Screen, Transcript } from "@/components/parts";

const BOOK_TASK = "Book a one-way train ticket from London to Manchester on the 09:15 train, for passenger Alex Taylor, and confirm the booking.";

const PRESETS = [
  { label: "Demo: Northline Rail", note: "typical inaccessible site", url: "/demo/broken", task: BOOK_TASK },
  { label: "Same site, fixed", note: "semantic HTML", url: "/demo/fixed", task: BOOK_TASK },
  { label: "W3C “BAD” demo", note: "real public site", url: "https://www.w3.org/WAI/demos/bad/before/home.html", task: "Find out what the weather forecast is for tomorrow." },
];

/** Speak screen reader output aloud, at the brisk rate real screen reader users prefer. */
function useSpeech(enabled: boolean) {
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled && typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, [enabled]);
  const speak = useCallback((step: StepEvent) => {
    if (!enabledRef.current || typeof window === "undefined" || !window.speechSynthesis) return;
    for (const line of step.spoken) {
      const u = new SpeechSynthesisUtterance(line.replace(/^\(announced\)\s*/, ""));
      u.rate = 1.35;
      window.speechSynthesis.speak(u);
    }
  }, []);
  const cancel = useCallback(() => window.speechSynthesis?.cancel(), []);
  return { speak, cancel };
}

export default function Home() {
  const [url, setUrl] = useState(PRESETS[0].url);
  const [task, setTask] = useState(PRESETS[0].task);
  const [voice, setVoice] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const { speak, cancel } = useSpeech(voice);
  const { state, start, stop } = useRun(speak);

  const running = state.phase !== "idle" && state.phase !== "done" && state.phase !== "error";
  const inJourney = state.phase === "journey" && !state.journey;
  const shown = selected !== null ? state.steps.find((s) => s.n === selected) ?? null : state.steps.at(-1) ?? null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    cancel();
    setSelected(null);
    void start(url.trim(), task.trim());
  };

  return (
    <div className="mx-auto max-w-[1360px] px-4 pb-24 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3 py-6">
        <a href="/" className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg border-2 border-focus text-focus" aria-hidden="true">◎</span>
          Blindspot
        </a>
        <p className="text-sm text-muted">
          Runs on <span className="font-semibold text-text">NVIDIA Nemotron</span> via <span className="font-semibold text-text">Nebius Token Factory</span>
        </p>
      </header>

      <main>
        <section className="py-6 sm:py-10" aria-labelledby="hero-h">
          <h1 id="hero-h" className="max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Watch an AI use your website <span className="text-focus">blind.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            Give Blindspot a URL and a task. An agent tries to finish it the way a blind person would: keyboard only, hearing only what the screen reader says. You see where it gets stuck, why, and the code that fixes it.
          </p>
        </section>

        <form onSubmit={onSubmit} className="rounded-2xl border border-line bg-panel p-4 sm:p-5" aria-label="Start a run">
          <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr_auto]">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Website</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://example.com" className="rounded-xl border border-line bg-ink px-3.5 py-3 font-mono text-sm" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Task for the blind user</span>
              <input value={task} onChange={(e) => setTask(e.target.value)} required placeholder="e.g. Sign up for the newsletter" className="rounded-xl border border-line bg-ink px-3.5 py-3 text-sm" />
            </label>
            <div className="flex items-end gap-2">
              {running ? (
                <button type="button" onClick={() => { stop(); cancel(); }} className="h-[46px] rounded-xl border border-line px-5 font-bold">Stop</button>
              ) : (
                <button type="submit" className="h-[46px] whitespace-nowrap rounded-xl bg-focus px-6 font-extrabold text-ink hover:brightness-110">Run Blindspot</button>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Try:</span>
            {PRESETS.map((p) => (
              <button key={p.label} type="button" disabled={running} onClick={() => { setUrl(p.url); setTask(p.task); }}
                className={`rounded-full border px-3 py-1 text-xs disabled:opacity-50 ${url === p.url ? "border-focus text-focus" : "border-line text-muted hover:text-text"}`}>
                {p.label} <span className="opacity-70">· {p.note}</span>
              </button>
            ))}
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} className="h-4 w-4 accent-[var(--focus)]" />
              Speak what the screen reader says
            </label>
          </div>
        </form>

        {state.phase !== "idle" && (
          <div className="mt-6 flex flex-col gap-6">
            <Pipeline phase={state.phase} />

            {state.errors.length > 0 && (
              <div role="alert" className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm">
                {state.errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}

            <section className="grid gap-6 lg:grid-cols-[1.35fr_1fr]" aria-label="Live session">
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">What a sighted user sees</h2>
                <Screen step={shown} live={inJourney && selected === null} />
                <p className="text-xs text-muted">
                  The yellow ring is where the screen reader&apos;s focus is.{" "}
                  {selected !== null && <button type="button" className="text-focus underline" onClick={() => setSelected(null)}>Back to live</button>}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted">
                  What a blind user hears <ModelBadge role="nano" />
                </h2>
                <Transcript steps={state.steps} selected={selected} onSelect={(n) => setSelected(selected === n ? null : n)} thinking={inJourney} />
              </div>
            </section>

            {state.journey && <JourneyBanner journey={state.journey} />}

            {(state.diagnosis || state.phase === "diagnosing") && (
              <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]" aria-labelledby="report-h">
                <div className="flex flex-col gap-4">
                  <h2 id="report-h" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted">
                    Why it happened <ModelBadge role="ultra" />
                  </h2>
                  {state.diagnosis ? (
                    <>
                      <div className="fade-up rounded-2xl border border-line bg-panel p-5">
                        <p className="text-xl font-bold leading-snug">{state.diagnosis.verdict}</p>
                        <p className="mt-2 text-muted">{state.diagnosis.explanation}</p>
                      </div>
                      {state.diagnosis.blockers.map((b) => (
                        <BlockerCard key={b.id} b={b} fix={state.fixes[b.id]} fixing={state.phase === "fixing"} />
                      ))}
                    </>
                  ) : (
                    <p className="flex items-center gap-2 text-muted"><span className="h-2 w-2 animate-pulse rounded-full bg-ultra" aria-hidden="true" /> Nemotron Ultra is reading the session and the rule checks…</p>
                  )}
                </div>
                <aside className="flex flex-col gap-4">
                  {state.axe && <AxeList axe={state.axe} invisible={state.invisible} />}
                  <Ledger calls={state.calls} models={state.models} />
                  {state.durationMs != null && <p className="text-xs text-muted">Full run took {(state.durationMs / 1000).toFixed(1)} s.</p>}
                </aside>
              </section>
            )}
          </div>
        )}

        {state.phase === "idle" && (
          <section className="mt-10 grid gap-4 sm:grid-cols-3" aria-label="How it works">
            {[
              ["1 · Navigate blind", "Nemotron Nano drives a real Chrome browser with only the keyboard. Each step it hears exactly what Chrome's accessibility tree would tell NVDA or VoiceOver."],
              ["2 · Diagnose", "axe-core runs the WCAG rule checks. Nemotron Ultra connects what the user heard to the root cause in the markup."],
              ["3 · Fix", "Tavily finds the matching W3C or MDN guidance, and Nemotron Super writes a fix you can paste in."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-2xl border border-line bg-panel p-5">
                <h2 className="font-bold">{t}</h2>
                <p className="mt-2 text-sm text-muted">{d}</p>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
