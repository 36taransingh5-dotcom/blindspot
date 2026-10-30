import type { ModelRole } from "./config";
import type { ModelCall } from "./llm";
import type { Box, InvisibleClickable } from "./sr/screenreader";

export type AgentAction =
  | { kind: "start" }
  | { kind: "press"; key: string }
  | { kind: "type"; text: string }
  | { kind: "focus"; id: string; label: string }
  | { kind: "finish"; success: boolean };

export type StepEvent = {
  type: "step";
  n: number;
  action: AgentAction;
  thought: string;
  /** Everything the screen reader spoke after this action, in order. */
  spoken: string[];
  screenshot: string;
  focusBox: Box | null;
  url: string;
  title: string;
  model: ModelRole | null;
};

export type AxeViolation = {
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  wcag: string[];
  count: number;
  sample: string;
};

export type Blocker = {
  id: string;
  title: string;
  severity: "blocker" | "serious" | "moderate";
  wcag: string;
  heard: string;
  why: string;
  evidenceStep: number | null;
  html: string | null;
  searchQuery: string;
};

export type Fix = {
  blockerId: string;
  after: string;
  explanation: string;
  source: { title: string; url: string } | null;
};

export type Outcome = "completed" | "blocked" | "gave_up";

export type RunEvent =
  | { type: "start"; url: string; task: string; models: Record<ModelRole, string> }
  | StepEvent
  | { type: "call"; call: ModelCall }
  | { type: "journey"; outcome: Outcome; reason: string; steps: number }
  | { type: "phase"; phase: "auditing" | "diagnosing" | "fixing"; label: string }
  | { type: "axe"; violations: AxeViolation[] }
  | { type: "invisible"; items: InvisibleClickable[] }
  | { type: "diagnosis"; verdict: string; explanation: string; blockers: Blocker[] }
  | { type: "fix"; fix: Fix }
  | { type: "done"; durationMs: number }
  | { type: "error"; message: string };
