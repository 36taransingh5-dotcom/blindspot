# Blindspot

**Watch an AI use your website blind.**

Give Blindspot a URL and a task ("book a train ticket", "sign up for the newsletter"). An agent tries to finish it the way a blind person would: keyboard only, hearing only what a screen reader says. You watch it live, see exactly where it gets stuck, learn *why*, and get the code that fixes it.

Around 96% of the top million home pages have detectable accessibility failures (WebAIM Million). Rule checkers list hundreds of issues but can't tell you which one actually stops a blind customer from checking out. Blindspot answers that question by trying.

Built for the Nebius × NVIDIA Global AI Hackathon. Every model call runs on **NVIDIA Nemotron** via **Nebius Token Factory**.

## How it works

```
URL + task
   │
   ▼
Real Chrome (Playwright) ── Chrome accessibility tree over CDP ──► "screen reader"
   │                                                                 │ speaks: "(no label), edit text, blank"
   ▼                                                                 ▼
Nemotron Nano ◄──── what was heard + elements list + page text ─────┘
   │  picks ONE action per step: Tab, Enter, type, jump to element, or finish
   ▼
journey: completed / blocked / gave up
   │
   ├─► axe-core WCAG rule checks + scan for mouse-only clickables (deterministic, no AI)
   ▼
Nemotron Ultra (reasoning on) ── diagnoses why, maps each blocker to a WCAG criterion
   │
   ▼
Tavily search (w3.org, MDN, WebAIM) ──► Nemotron Super writes the fix, citing its source
```

| Model | Job | Why this one |
|---|---|---|
| **Nemotron 3 Nano 30B-A3B** | Drives the keyboard, one decision per step (~15 calls a run) | Small, fast, cheap. Runs in the loop |
| **Nemotron 3 Ultra 550B-A55B** | Reads the whole session + audit and explains the root causes | One hard reasoning call, where quality matters most |
| **Nemotron 3 Super 120B-A12B** | Writes paste-ready HTML fixes from W3C guidance | Strong at code, run in parallel per blocker |

The UI badges every step with the model that made it, and shows call counts, latency and tokens per model.

### What keeps it honest

- **The agent never sees pixels or HTML.** It only gets what Chrome's accessibility tree exposes, the same computed names, roles and states NVDA and VoiceOver read. The screenshot in the UI is only for you.
- **Rule checks are deterministic.** axe-core and a DOM scan find the violations; the model only explains and prioritises them.
- **No invented markup.** Any "before" HTML that Ultra quotes is checked against what was actually captured during the run. Anything that doesn't match is dropped.
- **No blind give-ups.** Code forces the agent to probe with Tab before it may declare something unreachable, and warns it when it circles the same controls.

## The demo: Northline Rail

`/demo/broken` and `/demo/fixed` serve the same fictional train-booking page. For a mouse user they look and work identically. The broken one uses common real-world patterns: a `<div>` as the "Find tickets" button, an unlabelled "To" field, an icon-only swap button, and missing alt text.

| | Broken | Fixed |
|---|---|---|
| Blind journey | **Blocked** in 9–20 steps: Tab skips straight past "Find tickets" | **Completed** in 12 steps: "Booking confirmed, Reference NLR-48213" |
| axe-core | 4 rule types (label, button-name, image-alt, contrast) | 0 |

## Run it

Requires Node 20+ and a Chromium for Playwright.

```bash
npm install
npx playwright-core install chromium
cp .env.example .env.local   # add NEBIUS_API_KEY and TAVILY_API_KEY
npm run models               # confirm the Nemotron model IDs your key can use
npm run dev                  # http://localhost:3210
```

Headless run from the terminal, printing the whole trace:

```bash
npm run cli -- http://localhost:3210/demo/broken "Book a train ticket from London to Manchester"
```

Docker (uses Playwright's image, so Chromium is included):

```bash
docker build -t blindspot . && docker run -p 8080:8080 --env-file .env.local blindspot
```

| Variable | Required | Notes |
|---|---|---|
| `NEBIUS_API_KEY` | yes | Nebius Token Factory |
| `TAVILY_API_KEY` | recommended | Without it, fixes are still written but have no cited source |
| `MODEL_NANO` / `MODEL_SUPER` / `MODEL_ULTRA` | no | Override model IDs |
| `MAX_STEPS` | no | Default 30 |
| `ALLOW_PRIVATE_TARGETS` | no | Set to `1` to allow localhost/private URLs (off by default so a public deployment can't browse its own network) |

## Limitations

Published on purpose. This is a simulation, not a replacement for testing with blind users.

- **It's one simulated user.** Real screen reader users have different skills, settings and strategies. Blindspot finds barriers; it can't tell you a site is pleasant to use.
- **Runs vary.** Nano is a language model: the same broken page has ended "blocked" anywhere from 7 to 20 steps. Outcomes have been consistent across our runs; paths haven't.
- **The speech is an approximation.** Announcements are built from Chrome's accessibility tree in NVDA's style, but no real screen reader is running, so virtual-cursor quirks and browse/focus mode differences aren't modelled.
- **Keyboard and screen reader only.** It doesn't simulate screen magnifiers, switch access, voice control or cognitive load.
- **Logins, CAPTCHAs and multi-tab flows** are out of scope. It works on what a public URL shows.
- **Fixes need review.** They follow cited W3C/MDN guidance but are generated and should be checked before shipping (for example, Super labelled the swap button just "Swap" where "Swap origin and destination" is better).
- **Speed.** With Nano's reasoning on, a run takes about 1–3 minutes.

## Project layout

```
src/lib/sr/screenreader.ts   simulated screen reader on the CDP accessibility tree
src/lib/agent/journey.ts     Nemotron Nano keyboard loop + stuck detection
src/lib/agent/report.ts      axe-core, Ultra diagnosis, Tavily + Super fixes
src/lib/agent/run.ts         pipeline, streamed as events
src/app/api/run/route.ts     SSE endpoint (with private-network guard)
src/app/page.tsx             live UI
src/app/demo/[variant]/      Northline Rail broken / fixed
```

## License

MIT
