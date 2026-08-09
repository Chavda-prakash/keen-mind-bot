import { loadConfig } from "@/core/config";
import { checkOutboundUrl, domainOf } from "@/core/security/url-guard";
import { createDuckDuckGoProvider } from "./duckduckgo.server";
import { createBraveProvider, createTavilyProvider } from "./keyed.server";
import type { SearchHit, SearchProvider, SearchQuery } from "./types";
import { createWikipediaProvider } from "./wikipedia.server";

const factories: Record<string, () => SearchProvider> = {
  tavily: createTavilyProvider,
  brave: createBraveProvider,
  duckduckgo: createDuckDuckGoProvider,
  wikipedia: createWikipediaProvider,
};

export function listSearchProviders(): SearchProvider[] {
  return Object.keys(factories).map((id) => factories[id]!());
}

export interface SearchOutcome {
  hits: SearchHit[];
  providersTried: string[];
  providerUsed: string | null;
  errors: { provider: string; message: string }[];
}

/**
 * Graceful failover across configured providers. Never returns fabricated
 * results — if every provider fails, `hits` is empty and `errors` explains why.
 */
export async function searchWithFailover(q: SearchQuery): Promise<SearchOutcome> {
  const cfg = loadConfig();
  const order = [...cfg.searchProviderOrder];
  if (!order.includes("wikipedia")) order.push("wikipedia");

  const outcome: SearchOutcome = { hits: [], providersTried: [], providerUsed: null, errors: [] };

  for (const id of order) {
    const provider = factories[id]?.();
    if (!provider) continue;
    if (!(await provider.isAvailable())) continue;
    outcome.providersTried.push(id);
    try {
      const hits = await provider.search(q);
      const safe = hits.filter((h) => checkOutboundUrl(h.url).ok);
      if (safe.length > 0) {
        outcome.hits = safe;
        outcome.providerUsed = id;
        return outcome;
      }
      outcome.errors.push({ provider: id, message: "no usable results" });
    } catch (err) {
      outcome.errors.push({ provider: id, message: (err as Error).message });
    }
  }
  return outcome;
}

/** Domains we treat as higher-authority when ranking and de-duplicating. */
const AUTHORITY_HINTS: { test: RegExp; score: number }[] = [
  { test: /\.gov(\.[a-z]{2})?$/i, score: 1 },
  { test: /\.edu(\.[a-z]{2})?$/i, score: 0.95 },
  { test: /\.(int|who\.int)$/i, score: 0.95 },
  { test: /^(nature|science|arxiv|pubmed|ncbi\.nlm\.nih\.gov|ieee|acm)\./i, score: 0.9 },
  { test: /^(reuters|apnews|bbc|ft|economist|bloomberg|nytimes|theguardian)\./i, score: 0.8 },
  { test: /^(docs\.|developer\.|.*\.dev$)/i, score: 0.75 },
  { test: /^en\.wikipedia\.org$/i, score: 0.65 },
  { test: /(medium\.com|blogspot|wordpress\.com|quora\.com|pinterest\.)/i, score: 0.25 },
];

export function authorityScore(url: string): number {
  const domain = domainOf(url);
  for (const hint of AUTHORITY_HINTS) if (hint.test.test(domain)) return hint.score;
  return 0.5;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|ref|fbclid|gclid|mc_)/i.test(p)) u.searchParams.delete(p);
    }
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}${u.search}`;
  } catch {
    return url;
  }
}

/**
 * De-duplicate, drop low-value sources, and prefer authoritative + diverse
 * domains. Diversity is enforced with a per-domain cap.
 */
export function rankAndDedupe(
  hits: SearchHit[],
  opts: { maxPerDomain?: number; limit: number },
): (SearchHit & { authority: number })[] {
  const maxPerDomain = opts.maxPerDomain ?? 2;
  const seen = new Set<string>();
  const perDomain = new Map<string, number>();
  const scored = hits
    .map((h) => ({ ...h, authority: authorityScore(h.url) }))
    .sort((a, b) => b.authority - a.authority || a.rank - b.rank);

  const out: (SearchHit & { authority: number })[] = [];
  for (const hit of scored) {
    const key = normalizeUrl(hit.url);
    if (seen.has(key)) continue;
    if (hit.authority < 0.3 && out.length >= 3) continue;
    const count = perDomain.get(hit.domain) ?? 0;
    if (count >= maxPerDomain) continue;
    seen.add(key);
    perDomain.set(hit.domain, count + 1);
    out.push(hit);
    if (out.length >= opts.limit) break;
  }
  return out;
}