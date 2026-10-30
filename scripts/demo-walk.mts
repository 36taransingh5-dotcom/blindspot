// Scripted (no-AI) keyboard walk of both demo variants: checks the broken one blocks and the fixed one completes.
import { chromium } from "playwright-core";
import { ScreenReader } from "../src/lib/sr/screenreader";

const base = process.argv[2] ?? "http://localhost:3210";
const browser = await chromium.launch();
for (const variant of ["broken", "fixed"]) {
  const page = await browser.newPage();
  await page.goto(`${base}/demo/${variant}`);
  const sr = await ScreenReader.attach(page);
  const heard: string[] = [];
  const tab = async () => { await page.keyboard.press("Tab"); const a = (await sr.focused()).announcement; heard.push(a); return a; };
  for (let i = 0; i < 12; i++) {
    const a = await tab();
    if (/^From|e\.g\. London/.test(a)) await page.keyboard.type("London");
    else if (/^(To, |\(no label\)|edit text)/.test(a) && heard.filter((h) => h.includes("edit text")).length === 2) await page.keyboard.type("Manchester");
    else if (/^Find tickets/.test(a)) { await page.keyboard.press("Enter"); break; }
  }
  // Fixed: focus should now be on results heading; tab to second train's Select.
  if (variant === "fixed") {
    heard.push("AFTER FIND: " + (await sr.focused()).announcement);
    await tab(); await tab();
    heard.push("ON: " + (await sr.focused()).announcement);
    await page.keyboard.press("Enter");
    heard.push("AFTER SELECT: " + (await sr.focused()).announcement);
    await page.keyboard.type("Alex Taylor");
    await tab(); await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    heard.push("END: " + (await sr.focused()).announcement + " | live: " + (await sr.view()).liveRegions.join(";"));
  }
  console.log(`\n=== ${variant} ===\n` + heard.map((h, i) => `${i + 1}. ${h}`).join("\n"));
  console.log("title:", await page.title());
  await page.close();
}
await browser.close();
