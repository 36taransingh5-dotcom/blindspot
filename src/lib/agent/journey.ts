import { z } from "zod";
import type { Page } from "playwright-core";
import { chatJSON, type ModelCall } from "../llm";
import { ScreenReader, type FocusInfo, type PageView } from "../sr/screenreader";
import type { AgentAction, Outcome, StepEvent } from "../events";

const KEYS = ["Tab", "Shift+Tab", "Enter", "Space", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Escape"] as const;

const Decision = z.object({
  thought: z.string().default(""),
  action: z.enum(["press", "type", "focus", "finish"]),
  key: z.string().optional().nullable(),
  text: z.string().optional().nullable(),
  id: z.string().optional().nullable(),
  success: z.boolean().optional().nullable(),
  reason: z.string().optional().nullable(),
});
type Decision = z.infer<typeof Decision>;

const SYSTEM = `You are simulating a blind person using a website with a screen reader (like NVDA) and a keyboard only.
You CANNOT see the screen. You only know what the screen reader has spoken, the page's elements list, and its text read aloud in order.

Each turn, choose exactly ONE action and reply with JSON only:
{"thought": "<one short sentence, first person, about what you heard and why you act>",
 "action": "press" | "type" | "focus" | "finish",
 "key": one of ${KEYS.join(", ")}          (for press),
 "text": "<characters to type>"             (for type; only works when focus is on an edit field),
 "id": "<element id from the elements list>" (for focus: jump straight to that element, like NVDA's Elements List),
 "success": true|false, "reason": "<why>"   (for finish)}

How a real screen reader user behaves:
- Tab / Shift+Tab move between keyboard-focusable controls. Enter activates links and buttons. Space toggles checkboxes and presses buttons.
- "focus" jumps to an element from the elements list. Items that only appear in the page text (not the elements list) are NOT controls you can operate.
- Before typing, make sure focus is on the right edit field (check what was last announced). "type" REPLACES the field's whole contents, so to fix a wrong value just type the correct one.
- Fill each field once, then move on. Never repeat an action that changed nothing.
- To submit, find the button in the elements list. If the control you need (e.g. a search or submit button) is only in the page text and Tab from the last field skips past it, it is not keyboard reachable: you are blocked, so finish with success=false and say what you could not reach.
- A control announced as "(no label)" gives you no idea what it does. You may try it, but say it is a guess.
- Never assume anything visual (colours, icons, layout). Trust only what was spoken.
- finish with success=true ONLY when what you heard confirms the task is done.
- finish with success=false when you are genuinely stuck: the control you need is not reachable by keyboard, is unlabelled, focus is trapped, or nothing you try makes progress. Explain in terms of what you heard.`;

function describeAction(a: AgentAction): string {
  switch (a.kind) {
    case "start": return "Page loaded";
    case "press": return `Pressed ${a.key}`;
    case "type": return `Typed "${a.text}"`;
    case "focus": return `Jumped to ${a.label}`;
    case "finish": return a.success ? "Finished: task done" : "Gave up";
  }
}

function formatView(view: PageView, focus: FocusInfo): string {
  const els = view.elements
    .map((e) => `${e.id}: ${e.name || "(no label)"}, ${e.role}${e.states.length ? ", " + e.states.join(", ") : ""}${e.text ? ` [${e.text}]` : ""}`)
    .join("\n");
  return `Page title: ${view.title}
Currently focused: ${focus.announcement}

Elements list:
${els || "(empty)"}

Page text, read aloud in order:
${view.readout || "(nothing)"}`;
}

/** Detect the agent circling the same few controls (by Tab, jumps or typing) without progress. */
function stuckWarning(history: { where: string }[]): string | null {
  const last = history.slice(-10);
  if (last.length < 10) return null;
  const distinct = new Set(last.map((h) => h.where));
  return distinct.size <= 4
    ? `Warning: in your last 10 steps you only ever reached: ${[...distinct].join(" | ")}. You are not making progress. If the control you need is not reachable, finish with success=false now.`
    : null;
}

export async function runJourney(opts: {
  page: Page;
  task: string;
  maxSteps: number;
  emit: (e: StepEvent) => void;
  onCall: (c: ModelCall) => void;
  signal?: AbortSignal;
}): Promise<{ outcome: Outcome; reason: string; steps: number; evidenceHtml: string[]; trace: string[] }> {
  const { page } = opts;
  const sr = await ScreenReader.attach(page);
  const history: { action: AgentAction; heard: string; where: string }[] = [];
  const evidenceHtml = new Set<string>();
  const trace: string[] = [];

  const snapshot = async (n: number, action: AgentAction, thought: string, model: StepEvent["model"]) => {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(250);
    const focus = await sr.focused();
    const view = await sr.view();
    const live = sr.newLiveAnnouncements(view);
    const spoken = [focus.announcement, ...live.map((l) => `(announced) ${l}`)];
    if (focus.html) evidenceHtml.add(focus.html);
    const screenshot = (await page.screenshot({ type: "jpeg", quality: 55 })).toString("base64");
    opts.emit({
      type: "step", n, action, thought, spoken,
      screenshot: `data:image/jpeg;base64,${screenshot}`,
      focusBox: focus.box, url: page.url(), title: view.title, model,
    });
    const heard = spoken.join(" / ");
    history.push({ action, heard, where: `${focus.name || "(no label)"} ${focus.role}` });
    trace.push(`#${n} ${describeAction(action)}${thought ? ` (thought: ${thought})` : ""} -> heard: ${heard}${focus.html ? ` | focused html: ${focus.html.slice(0, 200)}` : ""}`);
    return { focus, view };
  };

  try {
    let { focus, view } = await snapshot(0, { kind: "start" }, "", null);

    for (let n = 1; n <= opts.maxSteps; n++) {
      if (opts.signal?.aborted) return { outcome: "gave_up", reason: "Run cancelled", steps: n - 1, evidenceHtml: [...evidenceHtml], trace };

      const recent = history.slice(-14).map((h, i, arr) => `${n - arr.length + i}. ${describeAction(h.action)} -> heard: "${h.heard}"`).join("\n");
      const warning = stuckWarning(history);
      const d: Decision = await chatJSON({
        role: "nano",
        purpose: `step ${n}: choose next keyboard action`,
        system: SYSTEM,
        user: `Your task: ${opts.task}

What happened so far:
${recent}
${warning ? "\n" + warning + "\n" : ""}
${formatView(view, focus)}

Step ${n} of at most ${opts.maxSteps}. Choose your next action.`,
        schema: Decision,
        thinking: true,
        maxTokens: 2500,
        onCall: opts.onCall,
      });

      // A real user would Tab onward before concluding something is unreachable; don't let the model give up blind.
      const triedTab = history.some((h) => h.action.kind === "press" && /Tab/.test(h.action.key));
      if (d.action === "finish" && !d.success && !triedTab && n < opts.maxSteps - 2) {
        d.action = "press";
        d.key = "Tab";
        d.thought = `${d.thought} (Blindspot: checking with Tab before giving up.)`.trim();
      }

      let action: AgentAction;
      if (d.action === "finish") {
        action = { kind: "finish", success: !!d.success };
        await snapshot(n, action, d.thought || d.reason || "", "nano");
        return {
          outcome: d.success ? "completed" : "blocked",
          reason: d.reason || d.thought || "",
          steps: n, evidenceHtml: [...evidenceHtml], trace,
        };
      } else if (d.action === "type") {
        const text = d.text ?? "";
        action = { kind: "type", text };
        if (focus.editable) {
          await page.keyboard.press("ControlOrMeta+A");
          await page.keyboard.type(text, { delay: 15 });
        }
        else d.thought = `${d.thought} (Focus was not on an edit field, so nothing was typed.)`.trim();
      } else if (d.action === "focus") {
        const id = d.id ?? "";
        const entry = view.elements.find((e) => e.id === id);
        action = { kind: "focus", id, label: entry ? `${entry.name || "(no label)"} ${entry.role}` : id };
        const res = await sr.focusElement(id);
        if (!res.ok) d.thought = `${d.thought} (${res.reason}.)`.trim();
      } else {
        const key = (KEYS as readonly string[]).includes(d.key ?? "") ? (d.key as string) : "Tab";
        action = { kind: "press", key };
        await page.keyboard.press(key === "Space" ? " " : key);
      }
      ({ focus, view } = await snapshot(n, action, d.thought, "nano"));
    }
    return { outcome: "gave_up", reason: `Ran out of steps (${opts.maxSteps}) without finishing the task`, steps: opts.maxSteps, evidenceHtml: [...evidenceHtml], trace };
  } finally {
    await sr.dispose();
  }
}
