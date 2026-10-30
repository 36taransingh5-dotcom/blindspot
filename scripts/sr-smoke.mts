import { chromium } from "playwright-core";
import { ScreenReader, findInvisibleClickables } from "../src/lib/sr/screenreader";

const html = `<!doctype html><html><head><title>Smoke</title></head><body>
<header><nav><a href="#">Home</a></nav></header>
<main><h1>Book tickets</h1>
<input placeholder="From">
<label>To <input id="to" required></label>
<button><svg width="10" height="10"></svg></button>
<div style="cursor:pointer" onclick="alert(1)">Find tickets</div>
<div role="status">3 results</div>
<input type="checkbox" checked aria-label="Return trip">
</main></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html);
const sr = await ScreenReader.attach(page);
const view = await sr.view();
console.log(JSON.stringify(view, null, 1));
for (let i = 0; i < 6; i++) {
  await page.keyboard.press("Tab");
  console.log("TAB ->", (await sr.focused()).announcement);
}
console.log("invisible:", await findInvisibleClickables(page));
await browser.close();
