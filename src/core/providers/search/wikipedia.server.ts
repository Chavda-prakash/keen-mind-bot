import type { SearchHit, SearchProvider, SearchQuery } from "./types";

/**
 * Keyless, highly-available encyclopedic provider. Used for source diversity
 * and as a graceful-degradation path when the general web provider fails.
 */
export function createWikipediaProvider(): SearchProvider {
  return {
    id: "wikipedia",
    label: "Wikipedia API (keyless)",
    requiresKey: false,
    async isAvailable() {
      return true;
    },
    async search(q: SearchQuery): Promise<SearchHit[]> {
      const params = new URLSearchParams({
        action: "query",
        list: "search",
        srsearch: q.query,
        srlimit: String(Math.min(q.limit, 10)),
        format: "json",
        origin: "*",
      });
      const res = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`, {
        headers: { "User-Agent": "SutradharResearchAgent/1.0" },
        signal: q.signal ?? AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`wikipedia search failed: ${res.status}`);
      const json = (await res.json()) as {
        query?: { search?: { title: string; snippet: string; timestamp?: string }[] };
      };
      return (json.query?.search ?? []).map((r, i) => ({
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
        title: r.title,
        snippet: r.snippet.replace(/<[^>]+>/g, ""),
        domain: "en.wikipedia.org",
        publishedAt: r.timestamp,
        provider: "wikipedia",
        rank: i + 1,
      }));
    },
  };
}