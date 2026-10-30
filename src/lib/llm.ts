import OpenAI from "openai";
import type { z } from "zod";
import { config, type ModelRole } from "./config";

/** One Token Factory call, reported to the UI so judges can see which model did what. */
export type ModelCall = {
  role: ModelRole;
  model: string;
  purpose: string;
  ms: number;
  promptTokens: number;
  completionTokens: number;
};

let client: OpenAI | null = null;
function tokenFactory(): OpenAI {
  if (!config.nebiusApiKey) throw new Error("NEBIUS_API_KEY is not set (see .env.example)");
  client ??= new OpenAI({ apiKey: config.nebiusApiKey, baseURL: config.nebiusBaseUrl });
  return client;
}

/** Nemotron reasoning models may inline their chain of thought; keep only the answer. */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*<\/think>/, "").trim();
}

function extractJson(text: string): unknown {
  const cleaned = stripThinking(text).replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error(`Model did not return JSON: ${cleaned.slice(0, 200)}`);
  }
}

// Some deployments reject chat_template_kwargs; remember that and stop sending it.
let templateKwargsSupported = true;

export async function chatJSON<T>(opts: {
  role: ModelRole;
  purpose: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  thinking?: boolean;
  maxTokens?: number;
  temperature?: number;
  onCall?: (call: ModelCall) => void;
}): Promise<T> {
  const model = config.models[opts.role];
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const started = Date.now();
    try {
      const body: Record<string, unknown> = {
        model,
        messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 1200,
        response_format: { type: "json_object" },
      };
      if (templateKwargsSupported && opts.thinking !== undefined) {
        body.chat_template_kwargs = { enable_thinking: opts.thinking };
      }
      const res = await tokenFactory().chat.completions.create(
        body as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
      );
      opts.onCall?.({
        role: opts.role,
        model,
        purpose: opts.purpose,
        ms: Date.now() - started,
        promptTokens: res.usage?.prompt_tokens ?? 0,
        completionTokens: res.usage?.completion_tokens ?? 0,
      });
      const content = res.choices[0]?.message?.content ?? "";
      const parsed = opts.schema.safeParse(extractJson(content));
      if (parsed.success) return parsed.data;
      lastError = parsed.error;
      messages.push(
        { role: "assistant", content },
        { role: "user", content: `That JSON did not match the schema: ${parsed.error.message.slice(0, 600)}. Reply with corrected JSON only.` },
      );
    } catch (err) {
      lastError = err;
      const msg = String((err as Error)?.message ?? err);
      if (templateKwargsSupported && /chat_template_kwargs/i.test(msg)) {
        templateKwargsSupported = false;
        continue;
      }
      if (err instanceof OpenAI.APIError && err.status && err.status < 500 && err.status !== 429) throw err;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
