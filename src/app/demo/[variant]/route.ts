/**
 * "Northline Rail": a deliberately realistic ticket-booking page served in two
 * variants. /demo/broken uses the div-soup patterns found all over the web;
 * /demo/fixed is the same page and flow with semantic HTML. Identical visuals
 * and behaviour for mouse users, very different for screen reader users.
 * Served as raw HTML (not React) so the markup is exactly what we wrote.
 */

const TRAINS = [
  { dep: "08:05", arr: "10:12", price: 54, changes: "Direct" },
  { dep: "09:15", arr: "11:20", price: 34, changes: "Direct" },
  { dep: "10:40", arr: "13:05", price: 29, changes: "1 change" },
];

function page(fixed: boolean): string {
  // Small helpers so both variants share one template.
  const btn = (label: string, attrs: string, cls = "btn") =>
    fixed ? `<button type="button" class="${cls}" ${attrs}>${label}</button>` : `<div class="${cls}" ${attrs}>${label}</div>`;
  const heading = (level: number, text: string, cls: string) =>
    fixed ? `<h${level} class="${cls}">${text}</h${level}>` : `<div class="${cls}">${text}</div>`;
  const field = (id: string, label: string, extra = "") =>
    fixed
      ? `<label class="field"><span class="lbl">${label}</span><input id="${id}" name="${id}" autocomplete="off" ${extra}></label>`
      : `<div class="field"><div class="lbl">${label}</div><input id="${id}" autocomplete="off" ${extra}></div>`;
  const swapIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"${fixed ? ' aria-hidden="true"' : ""}><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/></svg>`;

  const trainRows = TRAINS.map(
    (t, i) => `
      <li class="train">
        <div><strong class="time">${t.dep} → ${t.arr}</strong><span class="meta">${t.changes}</span></div>
        <div class="price">£${t.price}</div>
        ${btn(fixed ? `Select <span class="sr-only">${t.dep} train, £${t.price}</span>` : "Select", `data-train="${i}" onclick="selectTrain(${i})"`, "btn small")}
      </li>`,
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Northline Rail – Book tickets</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background: #f4f1ea; color: #1c1c1c; }
  .top { background: #0b3d2e; color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 14px 32px; }
  .brand { font-weight: 800; letter-spacing: .02em; font-size: 20px; }
  .top nav a { color: #d7efe4; margin-left: 20px; text-decoration: none; font-size: 15px; }
  .hero { padding: 40px 32px 8px; max-width: 980px; margin: 0 auto; }
  .h1 { font-size: 34px; font-weight: 800; margin: 0 0 6px; }
  .sub { color: ${fixed ? "#4a4a4a" : "#a9a9a9"}; margin: 0 0 22px; }
  .card { background: #fff; border-radius: 14px; padding: 22px; box-shadow: 0 2px 12px rgba(0,0,0,.06); max-width: 980px; margin: 0 auto 24px; }
  .row { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
  .field { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 180px; }
  .lbl { font-size: 13px; font-weight: 600; color: #555; }
  input { font: inherit; padding: 12px 14px; border: 1.5px solid #cfcac0; border-radius: 10px; }
  input:focus, .btn:focus, a:focus { outline: 3px solid #f2b705; outline-offset: 2px; }
  .swap { width: 44px; height: 46px; display: grid; place-items: center; border: 1.5px solid #cfcac0; border-radius: 10px; background: #fff; cursor: pointer; }
  .btn { background: #0f7b55; color: #fff; border: 0; border-radius: 10px; padding: 13px 22px; font: inherit; font-weight: 700; cursor: pointer; }
  .btn.small { padding: 9px 16px; }
  .h2 { font-size: 20px; font-weight: 800; margin: 0 0 12px; }
  ul { list-style: none; padding: 0; margin: 0; }
  .train { display: grid; grid-template-columns: 1fr auto auto; gap: 18px; align-items: center; padding: 14px 0; border-top: 1px solid #eee; }
  .time { font-size: 18px; display: block; }
  .meta { color: #666; font-size: 14px; }
  .price { font-weight: 800; font-size: 18px; }
  .hidden { display: none; }
  .confirm { text-align: center; padding: 28px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  footer { text-align: center; color: ${fixed ? "#595959" : "#777"}; font-size: 13px; padding: 30px; }
  footer a { color: #0b3d2e; margin: 0 8px; }
  .promo { display: flex; gap: 12px; max-width: 980px; margin: 0 auto 24px; }
  .promo img { width: 100%; height: 120px; object-fit: cover; border-radius: 12px; background: #cfe3d8; }
</style>
</head>
<body>
<${fixed ? "header" : "div"} class="top">
  <div class="brand">Northline Rail</div>
  <${fixed ? "nav" : "div"}${fixed ? ' aria-label="Main"' : ""}>
    <a href="#">Journeys</a><a href="#">Season tickets</a><a href="#">Help</a>
  </${fixed ? "nav" : "div"}>
</${fixed ? "header" : "div"}>

<${fixed ? "main" : "div"}>
  <section class="hero">
    ${heading(1, "Book a train ticket", "h1")}
    <p class="sub">Cheapest fares across the north, with no booking fee.</p>
  </section>

  <form class="card" id="search" onsubmit="event.preventDefault(); findTrains();">
    <div class="row">
      ${field("from", "From", fixed ? 'placeholder="e.g. London Euston"' : 'placeholder="From"')}
      ${fixed ? `<button type="button" class="swap" aria-label="Swap origin and destination" onclick="swap()">${swapIcon}</button>` : `<button type="button" class="swap" onclick="swap()">${swapIcon}</button>`}
      ${field("to", "To")}
      ${fixed ? `<button type="submit" class="btn">Find tickets</button>` : `<div class="btn" onclick="findTrains()">Find tickets</div>`}
    </div>
  </form>

  <section class="card hidden" id="results"${fixed ? ' aria-labelledby="results-h"' : ""}>
    ${fixed ? `<h2 class="h2" id="results-h" tabindex="-1">3 trains found</h2>` : `<div class="h2">3 trains found</div>`}
    <ul>${trainRows}</ul>
  </section>

  <section class="card hidden" id="passenger">
    ${heading(2, "Who is travelling?", "h2")}
    <div class="row">
      ${field("name", "Full name")}
      ${btn("Confirm booking", 'onclick="confirmBooking()"')}
    </div>
  </section>

  <section class="card hidden confirm" id="done">
    ${fixed ? `<h2 class="h1" id="done-h" tabindex="-1">Booking confirmed</h2>` : `<div class="h1">Booking confirmed</div>`}
    <p id="done-text"></p>
  </section>

  <div class="promo">
    <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"${fixed ? ' alt=""' : ""}>
    <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"${fixed ? ' alt=""' : ""}>
  </div>
</${fixed ? "main" : "div"}>

<div ${fixed ? 'role="status"' : ""} id="live" class="sr-only"></div>

<footer>© Northline Rail (a fictional demo company) · <a href="#">Accessibility</a><a href="#">Privacy</a><a href="#">Contact</a></footer>

<script>
  const TRAINS = ${JSON.stringify(TRAINS)};
  let chosen = null;
  const $ = (id) => document.getElementById(id);
  const say = (msg) => { $("live").textContent = ""; setTimeout(() => { $("live").textContent = msg; }, 50); };
  function swap() { const a = $("from").value; $("from").value = $("to").value; $("to").value = a; }
  function findTrains() {
    const from = $("from").value.trim(), to = $("to").value.trim();
    if (!from || !to) { say("Please enter where you are travelling from and to."); alertBox("Please enter where you are travelling from and to."); return; }
    $("results").classList.remove("hidden");
    say("3 trains found from " + from + " to " + to);
    ${fixed ? '$("results-h").focus();' : ""}
  }
  function selectTrain(i) {
    chosen = TRAINS[i];
    $("passenger").classList.remove("hidden");
    say("Selected the " + chosen.dep + " train. Enter the passenger name.");
    ${fixed ? '$("name").focus();' : ""}
  }
  function confirmBooking() {
    const name = $("name").value.trim();
    if (!name) { say("Please enter the passenger's full name."); return; }
    $("done").classList.remove("hidden");
    $("done-text").textContent = name + ", your " + chosen.dep + " train from " + $("from").value + " to " + $("to").value + " is booked. Reference NLR-48213.";
    document.title = "Booking confirmed – Northline Rail";
    say("Booking confirmed. Reference NLR-48213.");
    ${fixed ? '$("done-h").focus();' : ""}
  }
  function alertBox(msg) {
    let el = document.getElementById("err");
    if (!el) { el = document.createElement("p"); el.id = "err"; el.style.color = "#b00020"; $("search").appendChild(el); ${fixed ? 'el.setAttribute("role","alert");' : ""} }
    el.textContent = msg;
  }
</script>
</body>
</html>`;
}

export async function GET(_req: Request, ctx: { params: Promise<{ variant: string }> }) {
  const { variant } = await ctx.params;
  if (variant !== "broken" && variant !== "fixed") return new Response("Not found", { status: 404 });
  return new Response(page(variant === "fixed"), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
