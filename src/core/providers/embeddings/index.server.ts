import { loadConfig } from "@/core/config";

export const EMBEDDING_DIMS = 1536;

export interface EmbeddingsProvider {
  id: string;
  isLocal: boolean;
  isAvailable(): Promise<boolean>;
  embed(texts: string[]): Promise<number[][]>;
}

/** Pad/truncate to the storage dimension so the vector store stays replaceable. */
function normalizeDim(vec: number[]): number[] {
  if (vec.length === EMBEDDING_DIMS) return vec;
  if (vec.length > EMBEDDING_DIMS) return vec.slice(0, EMBEDDING_DIMS);
  return [...vec, ...new Array(EMBEDDING_DIMS - vec.length).fill(0)];
}

function lovableEmbeddings(): EmbeddingsProvider {
  return {
    id: "lovable",
    isLocal: false,
    async isAvailable() {
      return Boolean(process.env["LOVABLE_API_KEY"]);
    },
    async embed(texts) {
      const key = process.env["LOVABLE_API_KEY"];
      if (!key) throw new Error("LOVABLE_API_KEY not configured");
      const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: "openai/text-embedding-3-small",
          input: texts,
          dimensions: EMBEDDING_DIMS,
        }),
      });
      if (!res.ok) throw new Error(`embeddings failed: ${res.status} ${await res.text()}`);
      const json = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
      const sorted = (json.data ?? []).sort((a, b) => a.index - b.index);
      return sorted.map((d) => normalizeDim(d.embedding));
    },
  };
}

function ollamaEmbeddings(): EmbeddingsProvider {
  const base = () => loadConfig().ollamaBaseUrl.replace(/\/$/, "");
  return {
    id: "ollama",
    isLocal: true,
    async isAvailable() {
      try {
        return (await fetch(`${base()}/api/tags`, { signal: AbortSignal.timeout(1500) })).ok;
      } catch {
        return false;
      }
    },
    async embed(texts) {
      const cfg = loadConfig();
      const out: number[][] = [];
      for (const text of texts) {
        const res = await fetch(`${base()}/api/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: cfg.models.embed.model, prompt: text }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) throw new Error(`local embeddings failed: ${res.status}`);
        const json = (await res.json()) as { embedding?: number[] };
        out.push(normalizeDim(json.embedding ?? []));
      }
      return out;
    },
  };
}

const factories: Record<string, () => EmbeddingsProvider> = {
  lovable: lovableEmbeddings,
  ollama: ollamaEmbeddings,
};

/** Embeds with failover across the configured provider order. */
export async function embedTexts(texts: string[]): Promise<{ vectors: number[][]; provider: string }> {
  const cfg = loadConfig();
  const errors: string[] = [];
  for (const id of cfg.embeddingsProviderOrder) {
    const provider = factories[id]?.();
    if (!provider) continue;
    if (!(await provider.isAvailable())) {
      errors.push(`${id}: unavailable`);
      continue;
    }
    try {
      // Batch conservatively to stay inside provider limits.
      const vectors: number[][] = [];
      for (let i = 0; i < texts.length; i += 64) {
        vectors.push(...(await provider.embed(texts.slice(i, i + 64))));
      }
      return { vectors, provider: id };
    } catch (err) {
      errors.push(`${id}: ${(err as Error).message}`);
    }
  }
  throw new Error(`no embeddings provider available (${errors.join("; ")})`);
}

export function embedOne(text: string): Promise<number[]> {
  return embedTexts([text]).then((r) => r.vectors[0] ?? []);
}