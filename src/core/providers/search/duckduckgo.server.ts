import { domainOf } from "@/core/security/url-guard";
import { htmlToText } from "@/core/security/untrusted";
import type { SearchHit, SearchProvider, SearchQuery } from "./types";

const ENDPOINT = "https://html.duckduckgo.com/html/";

function decodeRedirect(href: string): string {
  // DuckDuckGo wraps some results as /l/?uddg=<encoded>
  const match = href.match(/[?&]uddg=([^&]+)/);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return href;
    }
  }
  if (href.startsWith("//")) return `https:${href}`;
  return href;
}

/** Keyless web search. Real results — no fabrication, no fallback fixtures. */
export function createDuckDuckGoProvider(): SearchProvider {
  return {
    id: "duckduckgo",
    label: "DuckDuckGo (keyless)",
    requiresKey: false,
    async isAvailable() {
      return true;
    },
    async search(q: SearchQuery): Promise<SearchHit[]> {
      const params = new URLSearchParams({ q: q.query, kl: "wt-wt" });
      const freshnessMap: Record<string, string> = { day: "d", week: "w", month: "m", year: "y" };
      if (q.freshness && freshnessMap[q.freshness]) params.set("df", freshnessMap[q.freshness]!);

      const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; SutradharResearchAgent/1.0; +https://lovable.dev)",
          Accept: "text/html",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: q.signal ?? AbortSignal.timeout(12_000),
      });
      if (!res.ok) throw new Error(`duckduckgo search failed: ${res.status}`);
      const html = await res.text();

      const hits: SearchHit[] = [];
      const blockRe =
        /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]+class="[^"]*result__a|<\/body>)/gi;
      let m: RegExpExecArray | null;
      while ((m = blockRe.exec(html)) && hits.length < q.limit) {
        const url = decodeRedirect(m[1] ?? "");
        const title = htmlToText(m[2] ?? "");
        const rest = m[3] ?? "";
        const snippetMatch = rest.match(
          /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
        );
        if (!url || !title) continue;
        hits.push({
          url,
          title,
          snippet: htmlToText(snippetMatch?.[1] ?? "").slice(0, 600),
          domain: domainOf(url),
          provider: "duckduckgo",
          rank: hits.length + 1,
        });
      }
      return hits;
    },
  };
}