import "server-only";

import { openrouter } from "@openrouter/ai-sdk-provider";
import { LanguageModel } from "ai";
import { ChatModel } from "app-types/chat";
import {
  createOpenAICompatibleModels,
  openaiCompatibleModelsSafeParse,
} from "./create-openai-compatiable";
import {
  ANTHROPIC_FILE_MIME_TYPES,
  DEFAULT_FILE_PART_MIME_TYPES,
  GEMINI_FILE_MIME_TYPES,
  OPENAI_FILE_MIME_TYPES,
} from "./file-support";

/**
 * asafe-ai — inference posture (ADR-0001).
 *
 * For the pilot, inference is routed through OpenRouter ONLY. The upstream direct-provider
 * blocks (openai / google / anthropic / xai / groq / ollama, each with its own API key) are
 * intentionally removed so that:
 *   1. no company data can egress outside the single approved OpenRouter path, and
 *   2. only the approved short list below is selectable in the UI.
 *
 * The short list (balanced / frontier / fast / cheapest) is a PROPOSED default — confirm the
 * exact set with Product/Eng + Security per ADR-0001. All ids are verified against the
 * OpenRouter models API. To change the list, edit the `openRouter` block only; the Wave 2
 * routing layer will select among these per task tier. The GA posture (OpenRouter vs direct EU
 * providers) is re-decided at Wave 4 — keep this seam provider-agnostic.
 */
const staticModels = {
  openRouter: {
    // Premium family — entitlement-only (not in routing tiers; granted per team/user).
    "gpt-5.5": openrouter("openai/gpt-5.5"),
    "claude-opus-4.8": openrouter("anthropic/claude-opus-4.8"),
    "gemini-3.5-flash": openrouter("google/gemini-3.5-flash"),
    "gemini-3.1-flash-lite": openrouter("google/gemini-3.1-flash-lite"),
    // Cost stack — the Auto routing tiers (live OpenRouter pricing 2026-06,
    // every slug verified servable on this account). NOTE: minimax/minimax-m3
    // was removed — this account's OpenRouter data policy returns 404
    // ("no endpoints matching guardrail restrictions") for it.
    "kimi-k2.6": openrouter("moonshotai/kimi-k2.6"), // frontier tier
    "deepseek-v4-flash": openrouter("deepseek/deepseek-v4-flash"), // fast tier
    "deepseek-v4-pro": openrouter("deepseek/deepseek-v4-pro"), // balanced tier
    "hy3-preview": openrouter("tencent/hy3-preview"), // cheap tier
  },
};

// No tool-call-unsupported models in the approved list. Kept (empty) for the merge below.
const staticUnsupportedModels = new Set<LanguageModel>([]);

// Every approved model accepts image input.
const staticSupportImageInputModels = {
  ...staticModels.openRouter,
};

const staticFilePartSupportByModel = new Map<
  LanguageModel,
  readonly string[]
>();

const registerFileSupport = (
  model: LanguageModel | undefined,
  mimeTypes: readonly string[] = DEFAULT_FILE_PART_MIME_TYPES,
) => {
  if (!model) return;
  staticFilePartSupportByModel.set(model, Array.from(mimeTypes));
};

registerFileSupport(staticModels.openRouter["gpt-5.5"], OPENAI_FILE_MIME_TYPES);
registerFileSupport(
  staticModels.openRouter["claude-opus-4.8"],
  ANTHROPIC_FILE_MIME_TYPES,
);
registerFileSupport(
  staticModels.openRouter["gemini-3.5-flash"],
  GEMINI_FILE_MIME_TYPES,
);
registerFileSupport(
  staticModels.openRouter["gemini-3.1-flash-lite"],
  GEMINI_FILE_MIME_TYPES,
);
// Cost stack: default (conservative) file mime set.
registerFileSupport(staticModels.openRouter["kimi-k2.6"]);
registerFileSupport(staticModels.openRouter["deepseek-v4-flash"]);
registerFileSupport(staticModels.openRouter["deepseek-v4-pro"]);
registerFileSupport(staticModels.openRouter["hy3-preview"]);

const openaiCompatibleProviders = openaiCompatibleModelsSafeParse(
  process.env.OPENAI_COMPATIBLE_DATA,
);

const {
  providers: openaiCompatibleModels,
  unsupportedModels: openaiCompatibleUnsupportedModels,
} = createOpenAICompatibleModels(openaiCompatibleProviders);

const allModels = { ...openaiCompatibleModels, ...staticModels };

const allUnsupportedModels = new Set([
  ...openaiCompatibleUnsupportedModels,
  ...staticUnsupportedModels,
]);

export const isToolCallUnsupportedModel = (model: LanguageModel) => {
  return allUnsupportedModels.has(model);
};

const isImageInputUnsupportedModel = (model: LanguageModel) => {
  return !(
    Object.values(staticSupportImageInputModels) as LanguageModel[]
  ).includes(model);
};

export const getFilePartSupportedMimeTypes = (model: LanguageModel) => {
  return staticFilePartSupportByModel.get(model) ?? [];
};

// Cheap-by-default: unresolved/unspecified models land on the fast-tier workhorse,
// not a premium model (cost directive, 2026-06).
const fallbackModel = staticModels.openRouter["deepseek-v4-flash"];

export const customModelProvider = {
  modelsInfo: Object.entries(allModels).map(([provider, models]) => ({
    provider,
    models: Object.entries(models).map(([name, model]) => ({
      name,
      isToolCallUnsupported: isToolCallUnsupportedModel(model),
      isImageInputUnsupported: isImageInputUnsupportedModel(model),
      supportedFileMimeTypes: [...getFilePartSupportedMimeTypes(model)],
    })),
    hasAPIKey: checkProviderAPIKey(provider as keyof typeof staticModels),
  })),
  getModel: (model?: ChatModel): LanguageModel => {
    if (!model) return fallbackModel;
    return allModels[model.provider]?.[model.model] || fallbackModel;
  },
};

function checkProviderAPIKey(provider: keyof typeof staticModels) {
  if (provider === "openRouter") {
    const key = process.env.OPENROUTER_API_KEY;
    return !!key && key != "****";
  }
  // openai-compatible (dynamic) providers manage their own keys.
  return true;
}
