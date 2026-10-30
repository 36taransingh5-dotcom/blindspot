"use client";

import { useCallback, useRef, useState } from "react";
import type { ModelCall } from "./llm";
import type { AxeViolation, Blocker, Fix, Outcome, RunEvent, StepEvent } from "./events";
import type { InvisibleClickable } from "./sr/screenreader";
import type { ModelRole } from "./config";

export type Phase = "idle" | "journey" | "auditing" | "diagnosing" | "fixing" | "done" | "error";

export type RunState = {
  phase: Phase;
  url: string;
  task: string;
  models: Record<ModelRole, string> | null;
  steps: StepEvent[];
  calls: ModelCall[];
  journey: { outcome: Outcome; reason: string; steps: number } | null;
  axe: AxeViolation[] | null;
  invisible: InvisibleClickable[] | null;
  diagnosis: { verdict: string; explanation: string; blockers: Blocker[] } | null;
  fixes: Record<string, Fix>;
  errors: string[];
  durationMs: number | null;
};

const initial: RunState = {
  phase: "idle", url: "", task: "", models: null, steps: [], calls: [], journey: null,
  axe: null, invisible: null, diagnosis: null, fixes: {}, errors: [], durationMs: null,
};

function reduce(s: RunState, e: RunEvent): RunState {
  switch (e.type) {
    case "start": return { ...s, phase: "journey", url: e.url, task: e.task, models: e.models };
    case "step": return { ...s, steps: [...s.steps, e] };
    case "call": return { ...s, calls: [...s.calls, e.call] };
    case "journey": return { ...s, journey: { outcome: e.outcome, reason: e.reason, steps: e.steps } };
    case "phase": return { ...s, phase: e.phase };
    case "axe": return { ...s, axe: e.violations };
    case "invisible": return { ...s, invisible: e.items };
    case "diagnosis": return { ...s, diagnosis: { verdict: e.verdict, explanation: e.explanation, blockers: e.blockers } };
    case "fix": return { ...s, fixes: { ...s.fixes, [e.fix.blockerId]: e.fix } };
    case "done": return { ...s, phase: "done", durationMs: e.durationMs };
    case "error": return { ...s, errors: [...s.errors, e.message], phase: s.phase === "journey" && !s.journey ? "error" : s.phase };
  }
}

export function useRun(onStep?: (step: StepEvent) => void) {
  const [state, setState] = useState<RunState>(initial);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (url: string, task: string) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setState({ ...initial, phase: "journey", url, task });
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, task }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Request failed (${res.status})`;
        setState((s) => ({ ...s, phase: "error", errors: [msg] }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as RunEvent;
          if (event.type === "step") onStep?.(event);
          setState((s) => reduce(s, event));
        }
      }
      setState((s) => (s.phase === "done" || s.phase === "error" ? s : { ...s, phase: s.errors.length ? "error" : "done" }));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState((s) => ({ ...s, phase: "error", errors: [...s.errors, (err as Error).message] }));
    }
  }, [onStep]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => ({ ...s, phase: s.phase === "idle" ? "idle" : "done" }));
  }, []);

  return { state, start, stop };
}
