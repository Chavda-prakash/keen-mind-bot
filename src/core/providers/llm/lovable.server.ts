import type { CompletionRequest, CompletionResult, LlmProvider } from "./types";
import { ProviderUnavailableError } from "./types";

const BASE_URL = "https://ai.gateway.lovable.dev/v1";

/** Hosted models through the Lovable AI Gateway (no user key required). */
export function createLovableLlmProvider(): LlmProvider {
  return {
    id: "lovable",
    label: "Lovable AI Gateway",
    isLocal: false,
    async isAvailable() {
      return Boolean(process.env["LOVABLE_API_KEY"]);
    },
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const key = process.env["LOVABLE_API_KEY"];
      if (!key) throw new ProviderUnavailableError("lovable", "LOVABLE_API_KEY is not configured");
      const start = Date.now();

      const body: Record<string, unknown> = {
        model: req.model,
        messages: req.messages,
      };
      if (req.temperature !== undefined) body["temperature"] = req.temperature;
      if (req.maxTokens !== undefined) body["max_tokens"] = req.maxTokens;
      if (req.json) body["response_format"] = { type: "json_object" };

      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify(body),
        signal: req.signal ?? null,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        const retryable = res.status === 429 || res.status >= 500;
        const err = new ProviderUnavailableError(
          "lovable",
          `${res.status} ${detail.slice(0, 400)}`,
        );
        (err as ProviderUnavailableError & { retryable?: boolean; status?: number }).retryable =
          retryable;
        (err as ProviderUnavailableError & { status?: number }).status = res.status;
        throw err;
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      return {
        text: json.choices?.[0]?.message?.content ?? "",
        provider: "lovable",
        model: req.model,
        promptTokens: json.usage?.prompt_tokens,
        completionTokens: json.usage?.completion_tokens,
        latencyMs: Date.now() - start,
      };
    },
  };
}