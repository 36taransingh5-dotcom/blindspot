export type ModelRole = "nano" | "super" | "ultra";

export const config = {
  nebiusApiKey: process.env.NEBIUS_API_KEY ?? "",
  nebiusBaseUrl: process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/",
  models: {
    nano: process.env.MODEL_NANO || "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
    super: process.env.MODEL_SUPER || "nvidia/nemotron-3-super-120b-a12b",
    ultra: process.env.MODEL_ULTRA || "nvidia/Nemotron-3-Ultra-550b-a55b",
  } satisfies Record<ModelRole, string>,
  tavilyApiKey: process.env.TAVILY_API_KEY ?? "",
  maxSteps: Number(process.env.MAX_STEPS || 30),
};

/** Human label for a role, shown on every model badge in the UI. */
export const roleLabel: Record<ModelRole, string> = {
  nano: "Nemotron Nano",
  super: "Nemotron Super",
  ultra: "Nemotron Ultra",
};

export function missingKeys(): string[] {
  const missing: string[] = [];
  if (!config.nebiusApiKey) missing.push("NEBIUS_API_KEY");
  if (!config.tavilyApiKey) missing.push("TAVILY_API_KEY");
  return missing;
}
