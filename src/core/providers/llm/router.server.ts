import { loadConfig } from "@/core/config";
import { createLovableLlmProvider } from "./lovable.server";
import { createOllamaLlmProvider } from "./ollama.server";
import type { ChatMessage, CompletionResult, LlmProvider } from "./types";
import { ProviderUnavailableError } from "./types";

export type ModelRole = "fast" | "reasoning" | "extract";

const factories: Record<string, () => LlmProvider> = {
  lovable: createLovableLlmProvider,
  ollama: createOllamaLlmProvider,
};

export function getLlmProvider(id: string): LlmProvider | null {
  const factory = factories[id];
  return factory ? factory() : null;
}

export function listLlmProviders(): LlmProvider[] {
  return Object.keys(factories).map((id) => factories[id]!());
}

export interface RouteOptions {
  role: ModelRole;
  messages: ChatMessage[];
  json?: boolean | undefined;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  signal?: AbortSignal | undefined;
  /** force a specific provider (used by multi-model comparison) */
  providerId?: string | undefined;
  modelOverride?: string | undefined;
}

export interface RoutedCompletion extends CompletionResult {
  isLocal: boolean;
  fallbacksUsed: string[];
}

/**
 * Model routing: picks the configured provider/model for a logical role and
 * transparently falls back through the configured provider order on failure.
 * Business logic never names a provider directly.
 */
export async function routeCompletion(opts: RouteOptions): Promise<RoutedCompletion> {
  const cfg = loadConfig();
  const preferred = cfg.models[opts.role];
  const order = opts.providerId
    ? [opts.providerId]
    : [preferred.provider, ...cfg.llmProviderOrder.filter((p) => p !== preferred.provider)];

  const fallbacksUsed: string[] = [];
  let lastError: unknown = null;

  for (const providerId of order) {
    const provider = getLlmProvider(providerId);
    if (!provider) continue;
    const model =
      opts.modelOverride ??
      (providerId === preferred.provider
        ? preferred.model
        : (cfg.models[opts.role].provider === providerId
            ? cfg.models[opts.role].model
            : defaultModelFor(providerId, opts.role)));
    try {
      const result = await provider.complete({
        model,
        messages: opts.messages,
        json: opts.json,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        signal: opts.signal,
      });
      if (!result.text.trim()) throw new ProviderUnavailableError(providerId, "empty completion");
      return { ...result, isLocal: provider.isLocal, fallbacksUsed };
    } catch (err) {
      lastError = err;
      fallbacksUsed.push(providerId);
    }
  }

  throw new Error(
    `All configured LLM providers failed (${order.join(", ")}): ${(lastError as Error)?.message ?? "unknown error"}`,
  );
}

function defaultModelFor(providerId: string, role: ModelRole): string {
  if (providerId === "ollama") return process.env["MODEL_LOCAL_FALLBACK"] ?? "llama3.1";
  return role === "reasoning" ? "google/gemini-3.6-flash" : "google/gemini-3.1-flash-lite";
}

/** Parse a JSON object out of a model response without trusting it blindly. */
export function parseJsonLoose<T>(text: string): T | null {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.search(/[[{]/);
    const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}