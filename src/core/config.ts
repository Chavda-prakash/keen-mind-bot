/**
 * Central provider / feature configuration.
 *
 * Nothing provider-specific may be hard-coded in UI or business logic — every
 * adapter reads from here. Secrets are only ever read inside server code.
 */

export type ProviderId = string;

export interface LlmModelConfig {
  /** logical role the model is used for */
  role: "fast" | "reasoning" | "extract" | "embed";
  provider: ProviderId;
  model: string;
}

export interface AgentLimits {
  maxSearchQueries: number;
  maxSourcesPerQuery: number;
  maxPagesRead: number;
  maxResearchLoops: number;
  fetchTimeoutMs: number;
  toolTimeoutMs: number;
  maxToolRetries: number;
  maxExtractChars: number;
}

export interface ResolvedConfig {
  llmProviderOrder: ProviderId[];
  searchProviderOrder: ProviderId[];
  embeddingsProviderOrder: ProviderId[];
  models: Record<LlmModelConfig["role"], { provider: ProviderId; model: string }>;
  limits: AgentLimits;
  flags: {
    localMode: boolean;
    browserAutomation: boolean;
    multiModelCompare: boolean;
    n8n: boolean;
  };
  ollamaBaseUrl: string;
  n8nWebhookUrl: string | null;
}

const num = (v: string | undefined, d: number) => {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
};
const bool = (v: string | undefined, d = false) =>
  v === undefined ? d : ["1", "true", "yes", "on"].includes(v.toLowerCase());
const list = (v: string | undefined, d: string[]) => {
  const parts = (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : d;
};

export const DEFAULT_LIMITS: AgentLimits = {
  maxSearchQueries: 5,
  maxSourcesPerQuery: 8,
  maxPagesRead: 8,
  maxResearchLoops: 2,
  fetchTimeoutMs: 12_000,
  toolTimeoutMs: 30_000,
  maxToolRetries: 2,
  maxExtractChars: 12_000,
};

/** Server-only: reads process.env. Never call from browser code. */
export function loadConfig(): ResolvedConfig {
  const env = process.env;
  const localMode = bool(env["AGENT_LOCAL_MODE"]);
  const hasLovableKey = Boolean(env["LOVABLE_API_KEY"]);

  const llmDefault = localMode
    ? ["ollama", "lovable"]
    : hasLovableKey
      ? ["lovable", "ollama"]
      : ["ollama"];

  const searchDefault: string[] = [];
  if (env["TAVILY_API_KEY"]) searchDefault.push("tavily");
  if (env["BRAVE_SEARCH_API_KEY"]) searchDefault.push("brave");
  searchDefault.push("duckduckgo");

  return {
    llmProviderOrder: list(env["LLM_PROVIDER_ORDER"], llmDefault),
    searchProviderOrder: list(env["SEARCH_PROVIDER_ORDER"], searchDefault),
    embeddingsProviderOrder: list(
      env["EMBEDDINGS_PROVIDER_ORDER"],
      localMode ? ["ollama", "lovable"] : ["lovable", "ollama"],
    ),
    models: {
      fast: {
        provider: localMode ? "ollama" : "lovable",
        model: env["MODEL_FAST"] ?? (localMode ? "llama3.1" : "google/gemini-3.1-flash-lite"),
      },
      reasoning: {
        provider: localMode ? "ollama" : "lovable",
        model: env["MODEL_REASONING"] ?? (localMode ? "llama3.1" : "google/gemini-3.6-flash"),
      },
      extract: {
        provider: localMode ? "ollama" : "lovable",
        model: env["MODEL_EXTRACT"] ?? (localMode ? "llama3.1" : "google/gemini-3.1-flash-lite"),
      },
      embed: {
        provider: localMode ? "ollama" : "lovable",
        model: env["MODEL_EMBED"] ?? (localMode ? "nomic-embed-text" : "google/gemini-embedding-001"),
      },
    },
    limits: {
      maxSearchQueries: num(env["AGENT_MAX_QUERIES"], DEFAULT_LIMITS.maxSearchQueries),
      maxSourcesPerQuery: num(env["AGENT_MAX_SOURCES_PER_QUERY"], DEFAULT_LIMITS.maxSourcesPerQuery),
      maxPagesRead: num(env["AGENT_MAX_PAGES"], DEFAULT_LIMITS.maxPagesRead),
      maxResearchLoops: num(env["AGENT_MAX_LOOPS"], DEFAULT_LIMITS.maxResearchLoops),
      fetchTimeoutMs: num(env["AGENT_FETCH_TIMEOUT_MS"], DEFAULT_LIMITS.fetchTimeoutMs),
      toolTimeoutMs: num(env["AGENT_TOOL_TIMEOUT_MS"], DEFAULT_LIMITS.toolTimeoutMs),
      maxToolRetries: num(env["AGENT_TOOL_RETRIES"], DEFAULT_LIMITS.maxToolRetries),
      maxExtractChars: num(env["AGENT_MAX_EXTRACT_CHARS"], DEFAULT_LIMITS.maxExtractChars),
    },
    flags: {
      localMode,
      browserAutomation: bool(env["ENABLE_BROWSER_AUTOMATION"]),
      multiModelCompare: bool(env["ENABLE_MULTI_MODEL_COMPARE"], true),
      n8n: Boolean(env["N8N_WEBHOOK_URL"]),
    },
    ollamaBaseUrl: env["OLLAMA_BASE_URL"] ?? "http://127.0.0.1:11434",
    n8nWebhookUrl: env["N8N_WEBHOOK_URL"] ?? null,
  };
}