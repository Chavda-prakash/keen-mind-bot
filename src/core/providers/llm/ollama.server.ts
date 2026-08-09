import { loadConfig } from "@/core/config";
import type { CompletionRequest, CompletionResult, LlmProvider } from "./types";
import { ProviderUnavailableError } from "./types";

/**
 * Local LLM adapter (Ollama, and LM Studio / llama.cpp servers that expose the
 * same `/api/chat` or an OpenAI-compatible `/v1/chat/completions` surface).
 *
 * IMPORTANT: local models have no live web knowledge. The orchestrator marks
 * every answer produced by a local provider without web evidence as
 * "offline knowledge only" — never as current information.
 */
export function createOllamaLlmProvider(): LlmProvider {
  const baseUrl = () => loadConfig().ollamaBaseUrl.replace(/\/$/, "");

  return {
    id: "ollama",
    label: "Local model (Ollama / LM Studio)",
    isLocal: true,
    async isAvailable() {
      try {
        const res = await fetch(`${baseUrl()}/api/tags`, {
          signal: AbortSignal.timeout(1500),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const start = Date.now();
      let res: Response;
      try {
        res = await fetch(`${baseUrl()}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: req.model,
            messages: req.messages,
            stream: false,
            format: req.json ? "json" : undefined,
            options: {
              temperature: req.temperature ?? 0.2,
              num_predict: req.maxTokens,
            },
          }),
          signal: req.signal ?? AbortSignal.timeout(120_000),
        });
      } catch (cause) {
        throw new ProviderUnavailableError(
          "ollama",
          `local model server unreachable at ${baseUrl()} (${(cause as Error).message})`,
        );
      }
      if (!res.ok) {
        throw new ProviderUnavailableError("ollama", `${res.status} ${await res.text().catch(() => "")}`);
      }
      const json = (await res.json()) as {
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };
      return {
        text: json.message?.content ?? "",
        provider: "ollama",
        model: req.model,
        promptTokens: json.prompt_eval_count,
        completionTokens: json.eval_count,
        latencyMs: Date.now() - start,
      };
    },
  };
}