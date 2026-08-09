import { domainOf } from "@/core/security/url-guard";
import type { SearchHit, SearchProvider, SearchQuery } from "./types";

/** Tavily — optional adapter, activated only when TAVILY_API_KEY is set. */
export function createTavilyProvider(): SearchProvider {
  return {
    id: "tavily",
    label: "Tavily (API key)",
    requiresKey: true,
    async isAvailable() {
      return Boolean(process.env["TAVILY_API_KEY"]);
    },
    async search(q: SearchQuery): Promise<SearchHit[]> {
      const key = process.env["TAVILY_API_KEY"];
      if (!key) throw new Error("TAVILY_API_KEY not configured");
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          query: q.query,
          max_results: q.limit,
          search_depth: "advanced",
          topic: q.freshness ? "news" : "general",
        }),
        signal: q.signal ?? AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`tavily search failed: ${res.status}`);
      const json = (await res.json()) as {
        results?: { url: string; title: string; content: string; published_date?: string }[];
      };
      return (json.results ?? []).map((r, i) => ({
        url: r.url,
        title: r.title,
        snippet: r.content?.slice(0, 600) ?? "",
        domain: domainOf(r.url),
        publishedAt: r.published_date,
        provider: "tavily",
        rank: i + 1,
      }));
    },
  };
}

/** Brave Search — optional adapter, activated only when BRAVE_SEARCH_API_KEY is set. */
export function createBraveProvider(): SearchProvider {
  return {
    id: "brave",
    label: "Brave Search (API key)",
    requiresKey: true,
    async isAvailable() {
      return Boolean(process.env["BRAVE_SEARCH_API_KEY"]);
    },
    async search(q: SearchQuery): Promise<SearchHit[]> {
      const key = process.env["BRAVE_SEARCH_API_KEY"];
      if (!key) throw new Error("BRAVE_SEARCH_API_KEY not configured");
      const params = new URLSearchParams({ q: q.query, count: String(q.limit) });
      if (q.freshness) {
        const map: Record<string, string> = { day: "pd", week: "pw", month: "pm", year: "py" };
        if (map[q.freshness]) params.set("freshness", map[q.freshness]!);
      }
      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        headers: { Accept: "application/json", "X-Subscription-Token": key },
        signal: q.signal ?? AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`brave search failed: ${res.status}`);
      const json = (await res.json()) as {
        web?: { results?: { url: string; title: string; description: string; age?: string }[] };
      };
      return (json.web?.results ?? []).map((r, i) => ({
        url: r.url,
        title: r.title,
        snippet: (r.description ?? "").replace(/<[^>]+>/g, "").slice(0, 600),
        domain: domainOf(r.url),
        publishedAt: r.age,
        provider: "brave",
        rank: i + 1,
      }));
    },
  };
}