import type { ApiProvider } from "./settings";

export interface OpenRouterModel {
  id: string;
  name: string;
  outputModalities: string[];
}

const TEXT_MODEL_KEYWORDS = ["gpt", "gemini"];
const TEXT_MODEL_EXCLUDE_KEYWORDS = [
  "audio",
  "tts",
  "image",
  "vision",
  "whisper",
  "dall-e",
  "midjourney",
];
const RECOMMENDED_TEXT_MODELS = ["gpt-4o-mini", "gemini-2.5-flash"];

export function getGeminiHardcodedModels(): OpenRouterModel[] {
  return [
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", outputModalities: ["text"] },
    {
      id: "gemini-2.5-flash-lite",
      name: "Gemini 2.5 Flash Lite",
      outputModalities: ["text"],
    },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", outputModalities: ["text"] },
    {
      id: "gemini-2.5-flash-lite-preview-09-2025",
      name: "Gemini 2.5 Flash Lite Preview 09-2025",
      outputModalities: ["text"],
    },
    {
      id: "gemini-2.5-flash-lite-preview-06-17-nothinking",
      name: "Gemini 2.5 Flash Lite Preview 06-17 (No Thinking)",
      outputModalities: ["text"],
    },
    {
      id: "gemini-2.5-pro-preview-06-05",
      name: "Gemini 2.5 Pro Preview 06-05",
      outputModalities: ["text"],
    },
    {
      id: "gemini-2.5-pro-preview-05-06",
      name: "Gemini 2.5 Pro Preview 05-06",
      outputModalities: ["text"],
    },
    {
      id: "google/gemini-3.1-pro-preview",
      name: "Gemini 3.1 Pro Preview",
      outputModalities: ["text", "image"],
    },
    {
      id: "gemini-3.1-flash-image-preview",
      name: "Nano Banana 2 (Gemini 3.1 Flash Image)",
      outputModalities: ["image"],
    },
    {
      id: "gemini-3-pro-image-preview",
      name: "Nano Banana Pro (Gemini 3 Pro Image)",
      outputModalities: ["image"],
    },
    {
      id: "gemini-pro-latest-thinking-*",
      name: "Gemini Pro Latest (Thinking)",
      outputModalities: ["text"],
    },
    {
      id: "gemini-flash-latest-nothinking",
      name: "Gemini Flash Latest (No Thinking)",
      outputModalities: ["text"],
    },
  ];
}

export function getOpenAIHardcodedModels(): OpenRouterModel[] {
  return [
    { id: "gpt-5", name: "GPT-5", outputModalities: ["text"] },
    { id: "gpt-5-mini", name: "GPT-5 Mini", outputModalities: ["text"] },
    { id: "gpt-5-nano", name: "GPT-5 Nano", outputModalities: ["text"] },
    { id: "gpt-4.1", name: "GPT-4.1", outputModalities: ["text"] },
    { id: "gpt-4o", name: "GPT-4o", outputModalities: ["text"] },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", outputModalities: ["text"] },
    { id: "gpt-image-2", name: "GPT Image 2", outputModalities: ["image"] },
  ];
}

export function getTextModels(
  provider: ApiProvider,
  modelCache: OpenRouterModel[],
  showAllTextModels: boolean,
): OpenRouterModel[] {
  if (provider === "codex") return [];
  if (provider === "openai") {
    return modelCache.filter((m) => m.outputModalities.includes("text"));
  }

  const isGemini = provider === "gemini";
  const filtered = modelCache.filter((m) => {
    const idLower = m.id.toLowerCase();
    if (!isGemini && !m.outputModalities.includes("text")) return false;
    if (TEXT_MODEL_EXCLUDE_KEYWORDS.some((kw) => idLower.includes(kw))) {
      return false;
    }
    if (!TEXT_MODEL_KEYWORDS.some((kw) => idLower.includes(kw))) {
      return false;
    }
    return meetsMinimumVersion(m.id);
  });

  const sorted = sortModels(filtered);
  return showAllTextModels ? sorted : pickRecommendedTextModels(sorted);
}

export function getImageModels(
  provider: ApiProvider,
  modelCache: OpenRouterModel[],
): OpenRouterModel[] {
  if (provider === "codex") return [];
  if (provider === "openai") {
    return modelCache.filter((m) => m.outputModalities.includes("image"));
  }

  const isGemini = provider === "gemini";
  const filtered = modelCache.filter((m) => {
    const idLower = m.id.toLowerCase();
    if (!isGemini && !m.outputModalities.includes("image")) return false;
    if (!idLower.includes("gemini") || !idLower.includes("image")) {
      return false;
    }
    return meetsMinimumVersion(m.id);
  });

  return sortModels(filtered);
}

function meetsMinimumVersion(modelId: string): boolean {
  const idLower = modelId.toLowerCase();
  if (idLower.includes("gpt")) {
    const gptMatch = idLower.match(/gpt-(\d+)(?:\.(\d+))?/);
    return gptMatch ? parseInt(gptMatch[1]) >= 4 : false;
  }

  if (idLower.includes("gemini")) {
    const geminiMatch = idLower.match(/gemini-(\d+)(?:\.(\d+))?/);
    if (!geminiMatch) return true;
    const major = parseInt(geminiMatch[1]);
    const minor = geminiMatch[2] ? parseInt(geminiMatch[2]) : 0;
    return major > 2 || (major === 2 && minor >= 5);
  }

  return true;
}

function sortModels(models: OpenRouterModel[]): OpenRouterModel[] {
  return [...models].sort((a, b) => {
    const aLower = a.id.toLowerCase();
    const bLower = b.id.toLowerCase();
    const aIsGemini = aLower.includes("gemini");
    const bIsGemini = bLower.includes("gemini");
    const aIsGPT = aLower.includes("gpt");
    const bIsGPT = bLower.includes("gpt");

    if (aIsGemini && !bIsGemini) return -1;
    if (!aIsGemini && bIsGemini) return 1;
    if (aIsGPT && !bIsGPT && !bIsGemini) return -1;
    if (!aIsGPT && bIsGPT && !aIsGemini) return 1;

    const aVersion = extractVersion(aLower);
    const bVersion = extractVersion(bLower);
    for (let i = 0; i < 3; i++) {
      if (aVersion[i] !== bVersion[i]) return bVersion[i] - aVersion[i];
    }
    return a.id.localeCompare(b.id);
  });
}

function extractVersion(id: string): number[] {
  const match = id.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return [0, 0, 0];
  return [
    parseInt(match[1] || "0"),
    parseInt(match[2] || "0"),
    parseInt(match[3] || "0"),
  ];
}

function pickRecommendedTextModels(
  models: OpenRouterModel[],
): OpenRouterModel[] {
  const byId = new Map(models.map((m) => [m.id, m] as const));
  const selected: OpenRouterModel[] = [];
  for (const id of RECOMMENDED_TEXT_MODELS) {
    const hit = byId.get(id);
    if (hit) selected.push(hit);
  }
  return selected.length > 0 ? selected : models.slice(0, 2);
}
