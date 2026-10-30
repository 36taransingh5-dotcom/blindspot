import type { CDPSession, Page } from "playwright-core";

/**
 * A simulated screen reader. Everything it "hears" comes from Chrome's own
 * accessibility tree over CDP (the same computed names and roles NVDA/VoiceOver
 * get), never from pixels or raw HTML. That is what makes the agent's experience
 * an honest proxy for a blind user's.
 */

export type Box = { x: number; y: number; w: number; h: number };

export type FocusInfo = {
  announcement: string;
  role: string;
  name: string;
  editable: boolean;
  box: Box | null;
  html: string;
};

export type ElementEntry = {
  id: string;
  role: string;
  name: string;
  states: string[];
  text?: string;
};

export type PageView = {
  title: string;
  url: string;
  elements: ElementEntry[];
  readout: string;
  liveRegions: string[];
};

type AXValue = { type: string; value?: unknown };
type AXProperty = { name: string; value: AXValue };
type AXNode = {
  nodeId: string;
  ignored: boolean;
  role?: AXValue;
  name?: AXValue;
  description?: AXValue;
  value?: AXValue;
  properties?: AXProperty[];
  childIds?: string[];
  parentId?: string;
  backendDOMNodeId?: number;
};

const ROLE_SPEECH: Record<string, string> = {
  textbox: "edit text",
  searchbox: "search edit text",
  combobox: "combo box",
  checkbox: "check box",
  radio: "radio button",
  link: "link",
  button: "button",
  heading: "heading",
  listbox: "list box",
  option: "option",
  menuitem: "menu item",
  tab: "tab",
  switch: "switch",
  slider: "slider",
  spinbutton: "spin button",
  dialog: "dialog",
  alertdialog: "alert dialog",
  img: "graphic",
  image: "graphic",
  RootWebArea: "document",
  WebArea: "document",
  generic: "",
  none: "",
  StaticText: "",
};

const INTERACTIVE = new Set([
  "link", "button", "textbox", "searchbox", "combobox", "checkbox", "radio", "listbox",
  "option", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "switch", "slider", "spinbutton",
]);
const LANDMARKS = new Set([
  "banner", "navigation", "main", "contentinfo", "complementary", "search", "form", "region",
  "dialog", "alertdialog",
]);
const LIVE = new Set(["alert", "status", "log"]);
const EDITABLE = new Set(["textbox", "searchbox", "combobox", "spinbutton"]);

const str = (v?: AXValue) => (v?.value == null ? "" : String(v.value));

function statesOf(node: AXNode): string[] {
  const out: string[] = [];
  for (const p of node.properties ?? []) {
    const v = p.value?.value;
    switch (p.name) {
      case "checked":
        out.push(v === "true" || v === true ? "checked" : v === "mixed" ? "half checked" : "not checked");
        break;
      case "expanded":
        out.push(v ? "expanded" : "collapsed");
        break;
      case "pressed":
        out.push(v === "true" || v === true ? "pressed" : "not pressed");
        break;
      case "selected":
        if (v) out.push("selected");
        break;
      case "required":
        if (v) out.push("required");
        break;
      case "invalid":
        if (v && v !== "false") out.push("invalid entry");
        break;
      case "disabled":
        if (v) out.push("unavailable");
        break;
      case "level":
        out.push(`level ${v}`);
        break;
      case "hasPopup":
        if (v && v !== "false") out.push("has pop-up");
        break;
    }
  }
  return out;
}

/** Render an AX node the way NVDA would speak it: "name, role, states, value". */
export function speak(node: AXNode): string {
  const role = str(node.role);
  const name = str(node.name).trim();
  const roleWord = ROLE_SPEECH[role] ?? role;
  const parts: string[] = [];
  if (name) parts.push(name);
  if (roleWord) parts.push(roleWord);
  parts.push(...statesOf(node));
  if (EDITABLE.has(role)) {
    const value = str(node.value).trim();
    parts.push(value ? value : "blank");
  }
  const desc = str(node.description).trim();
  if (desc) parts.push(desc);
  if (!name && INTERACTIVE.has(role)) parts.unshift("(no label)");
  if (parts.length === 0) return role === "generic" ? "clickable" : "blank";
  return parts.join(", ");
}

export class ScreenReader {
  private idToBackend = new Map<string, number>();
  private lastLive = new Set<string>();

  private constructor(
    readonly page: Page,
    private cdp: CDPSession,
  ) {}

  static async attach(page: Page): Promise<ScreenReader> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("DOM.enable");
    await cdp.send("Accessibility.enable");
    return new ScreenReader(page, cdp);
  }

  /** What the screen reader says about the element that currently has focus. */
  async focused(): Promise<FocusInfo> {
    const { result } = await this.cdp.send("Runtime.evaluate", {
      expression: `(() => { let a = document.activeElement; while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement; return a; })()`,
    });
    const title = await this.page.title().catch(() => "");
    if (!result.objectId) {
      return { announcement: `${title}, document`, role: "document", name: title, editable: false, box: null, html: "" };
    }
    const [{ nodes }, meta] = await Promise.all([
      this.cdp.send("Accessibility.getPartialAXTree", { objectId: result.objectId, fetchRelatives: false }) as Promise<{ nodes: AXNode[] }>,
      this.cdp.send("Runtime.callFunctionOn", {
        objectId: result.objectId,
        returnByValue: true,
        functionDeclaration: `function () {
          const r = this.getBoundingClientRect();
          // Collapse SVG path data so the snippet stays short but still well-formed.
          const html = (this.outerHTML || "").replace(/(<svg[^>]*>)[\\s\\S]*?<\\/svg>/g, "$1…</svg>").replace(/\\s+/g, " ").slice(0, 600);
          return { tag: this.tagName, box: { x: r.x, y: r.y, w: r.width, h: r.height }, html };
        }`,
      }),
    ]);
    const m = meta.result.value as { tag: string; box: Box; html: string };
    const node = nodes.find((n) => !n.ignored) ?? nodes[0];
    if (!node || m.tag === "BODY" || m.tag === "HTML") {
      return { announcement: `${title}, document`, role: "document", name: title, editable: false, box: null, html: "" };
    }
    const role = str(node.role);
    return {
      announcement: speak(node),
      role,
      name: str(node.name),
      editable: EDITABLE.has(role),
      box: m.box.w > 0 && m.box.h > 0 ? m.box : null,
      html: m.html,
    };
  }

  /**
   * The screen reader's "elements list" plus a linear readout of the page text,
   * built from the accessibility tree in document order. Element ids are stable
   * only until the next call.
   */
  async view(maxElements = 120, maxReadout = 2000): Promise<PageView> {
    const { nodes } = (await this.cdp.send("Accessibility.getFullAXTree")) as { nodes: AXNode[] };
    const byId = new Map(nodes.map((n) => [n.nodeId, n]));
    const root = nodes.find((n) => !n.parentId) ?? nodes[0];
    this.idToBackend.clear();

    const elements: ElementEntry[] = [];
    const text: string[] = [];
    const live: string[] = [];
    let counter = 0;

    const textUnder = (n: AXNode, depth = 0): string => {
      if (depth > 12) return "";
      const parts: string[] = [];
      for (const cid of n.childIds ?? []) {
        const c = byId.get(cid);
        if (!c) continue;
        if (!c.ignored && str(c.role) === "StaticText") parts.push(str(c.name));
        parts.push(textUnder(c, depth + 1));
      }
      return parts.join(" ").replace(/\s+/g, " ").trim();
    };

    const walk = (n: AXNode | undefined, depth: number) => {
      if (!n || depth > 200) return;
      const role = str(n.role);
      if (!n.ignored) {
        if (role === "StaticText") {
          const t = str(n.name).trim();
          if (t) text.push(t);
        } else if (INTERACTIVE.has(role) || role === "heading" || LANDMARKS.has(role) || LIVE.has(role) || role === "img" || role === "image") {
          if (elements.length < maxElements && n.backendDOMNodeId) {
            const id = `e${++counter}`;
            this.idToBackend.set(id, n.backendDOMNodeId);
            const entry: ElementEntry = { id, role, name: str(n.name).trim(), states: statesOf(n) };
            if (LIVE.has(role)) {
              entry.text = textUnder(n).slice(0, 200);
              if (entry.text) live.push(`${role}: ${entry.text}`);
            }
            if (EDITABLE.has(role)) entry.text = str(n.value).slice(0, 80);
            elements.push(entry);
          }
        }
      }
      for (const cid of n.childIds ?? []) walk(byId.get(cid), depth + 1);
    };
    walk(root, 0);

    let readout = text.join(" ").replace(/\s+/g, " ");
    if (readout.length > maxReadout) readout = readout.slice(0, maxReadout) + " …";

    return { title: await this.page.title().catch(() => ""), url: this.page.url(), elements, readout, liveRegions: live };
  }

  /** Live-region messages that appeared since the last call: what a screen reader would interrupt to announce. */
  newLiveAnnouncements(view: PageView): string[] {
    const now = new Set(view.liveRegions);
    const fresh = view.liveRegions.filter((l) => !this.lastLive.has(l));
    this.lastLive = now;
    return fresh;
  }

  /** Move focus to an item from the elements list, like choosing it in NVDA's Elements List. */
  async focusElement(id: string): Promise<{ ok: boolean; reason?: string }> {
    const backendNodeId = this.idToBackend.get(id);
    if (!backendNodeId) return { ok: false, reason: `No element ${id} in the current list` };
    try {
      await this.cdp.send("DOM.focus", { backendNodeId });
      return { ok: true };
    } catch {
      // A real screen reader can still put its virtual cursor here, but nothing
      // keyboard-operable lives at this spot.
      return { ok: false, reason: "That element cannot take keyboard focus" };
    }
  }

  async dispose() {
    await this.cdp.detach().catch(() => {});
  }
}

export type InvisibleClickable = { html: string; box: Box; text: string };

/**
 * Elements a sighted mouse user can click but a keyboard / screen reader user
 * cannot reach: pointer cursor, no interactive role, not focusable. Plain DOM
 * heuristics, no model involved.
 */
export async function findInvisibleClickables(page: Page, limit = 20): Promise<InvisibleClickable[]> {
  return page.evaluate((limit) => {
    const NATIVE = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "LABEL", "SUMMARY", "OPTION", "VIDEO", "AUDIO"]);
    const ROLES = new Set(["button", "link", "checkbox", "radio", "tab", "menuitem", "option", "switch", "combobox", "textbox"]);
    const out: { html: string; box: { x: number; y: number; w: number; h: number }; text: string }[] = [];
    const counted: Element[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      if (out.length >= limit) break;
      if (NATIVE.has(el.tagName)) continue;
      if (el.closest("a,button,label,summary,[role=button],[role=link]")) continue;
      if (counted.some((c) => c.contains(el))) continue;
      const style = getComputedStyle(el);
      if (style.cursor !== "pointer" || style.visibility === "hidden" || style.display === "none") continue;
      if (el.parentElement && getComputedStyle(el.parentElement).cursor === "pointer") continue;
      const role = el.getAttribute("role");
      if (role && ROLES.has(role)) continue;
      if (el.tabIndex >= 0) continue;
      if (el.querySelector("a,button,input,select,textarea,[tabindex]")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      counted.push(el);
      out.push({
        html: el.outerHTML.replace(/\s+/g, " ").slice(0, 300),
        box: { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height },
        text: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 80),
      });
    }
    return out;
  }, limit);
}
