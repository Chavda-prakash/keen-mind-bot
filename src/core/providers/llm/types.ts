export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  /** ask the provider for a JSON object back */
  json?: boolean | undefined;
  signal?: AbortSignal | undefined;
}

export interface CompletionResult {
  text: string;
  provider: string;
  model: string;
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  latencyMs: number;
}

export interface LlmProvider {
  id: string;
  label: string;
  /** true when the provider is reachable & configured in this environment */
  isAvailable(): Promise<boolean>;
  /** local providers have no live web knowledge — the agent must never imply otherwise */
  isLocal: boolean;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

export class ProviderUnavailableError extends Error {
  constructor(
    public providerId: string,
    message: string,
  ) {
    super(`[${providerId}] ${message}`);
    this.name = "ProviderUnavailableError";
  }
}