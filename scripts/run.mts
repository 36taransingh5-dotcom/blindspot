// Headless end-to-end run, printing every event except screenshots. Usage: npm run cli -- <url> "<task>"
import { runBlindspot } from "../src/lib/agent/run";
const [url = "http://localhost:3210/demo/broken", task = "Book a one-way train ticket from London to Manchester on the 09:15 train, for passenger Alex Taylor, and confirm the booking."] = process.argv.slice(2);
await runBlindspot({
  url, task,
  emit: (e) => {
    if (e.type === "step") console.log(`#${e.n} [${e.action.kind}${"key" in e.action ? " " + e.action.key : ""}${"text" in e.action ? ' "' + e.action.text + '"' : ""}${"label" in e.action ? " " + e.action.label : ""}] ${e.spoken.join(" / ")}${e.thought ? `\n     ~ ${e.thought}` : ""}`);
    else if (e.type === "call") console.log(`   (${e.call.role} ${e.call.ms}ms ${e.call.promptTokens}+${e.call.completionTokens}tok: ${e.call.purpose})`);
    else console.log(JSON.stringify(e, null, 1));
  },
});
