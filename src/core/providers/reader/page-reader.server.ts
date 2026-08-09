import { loadConfig } from "@/core/config";
import { checkOutboundUrl, domainOf } from "@/core/security/url-guard";
import { htmlToText, scanForInjection } from "@/core/security/untrusted";

export interface ReadPageResult {
  url: string;
  domain: string;
  title: string | null;
  author: string | null;
  publishedAt: string | null;
  text: string;
  truncated: boolean;
  injectionLabels: string[];
  fetchedAt: string;
}

function metaContent(html: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return htmlToText(m[1]).slice(0, 300) || null;
  }
  return null;
}

/**
 * Fetch a page and extract readable main content. Applies SSRF guards, size
 * limits, content-type checks, and prompt-injection scanning. The returned text
 * is untrusted data.
 */
export async function readPage(
  url: string,
  opts: { allowedDomains?: string[]; maxChars?: number; signal?: AbortSignal } = {},
): Promise<ReadPageResult> {
  const cfg = loadConfig();
  const check = checkOutboundUrl(url, opts.allowedDomains);
  if (!check.ok || !check.url) throw new Error(`refused to fetch url: ${check.reason}`);

  const res = await fetch(check.url.toString(), {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SutradharResearchAgent/1.0)",
      Accept: "text/html,application/xhtml+xml,text/plain",
    },
    signal: opts.signal ?? AbortSignal.timeout(cfg.limits.fetchTimeoutMs),
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);

  // Guard against redirects into private space after the initial check.
  const finalCheck = checkOutboundUrl(res.url || check.url.toString(), opts.allowedDomains);
  if (!finalCheck.ok) throw new Error(`refused after redirect: ${finalCheck.reason}`);

  const contentType = res.headers.get("content-type") ?? "";
  if (!/text\/html|text\/plain|application\/xhtml|application\/json/i.test(contentType)) {
    throw new Error(`unsupported content-type: ${contentType || "unknown"}`);
  }

  const maxChars = opts.maxChars ?? cfg.limits.maxExtractChars;
  const raw = await res.text();
  const capped = raw.slice(0, 400_000);

  const isHtml = /html/i.test(contentType);
  const bodyMatch = capped.match(/<(?:article|main)[^>]*>([\s\S]*?)<\/(?:article|main)>/i);
  const text = isHtml ? htmlToText(bodyMatch?.[1] ?? capped) : capped;
  const truncated = text.length > maxChars;
  const finalText = truncated ? text.slice(0, maxChars) : text;

  return {
    url: res.url || check.url.toString(),
    domain: domainOf(res.url || check.url.toString()),
    title:
      metaContent(capped, [
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i,
        /<title[^>]*>([\s\S]*?)<\/title>/i,
      ]) ?? null,
    author: metaContent(capped, [
      /<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)/i,
      /<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)/i,
    ]),
    publishedAt: metaContent(capped, [
      /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)/i,
      /<meta[^>]+name=["'](?:date|pubdate|publish-date)["'][^>]+content=["']([^"']+)/i,
      /<time[^>]+datetime=["']([^"']+)/i,
    ]),
    text: finalText,
    truncated,
    injectionLabels: scanForInjection(finalText).labels,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Pick the passages of a page that actually relate to the query instead of
 * shipping the whole document to the model.
 */
export function extractRelevantPassages(
  text: string,
  query: string,
  opts: { maxPassages?: number; passageChars?: number } = {},
): { text: string; score: number }[] {
  const maxPassages = opts.maxPassages ?? 4;
  const passageChars = opts.passageChars ?? 900;
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
  if (terms.length === 0) return [{ text: text.slice(0, passageChars), score: 0 }];

  const paragraphs = text
    .split(/\n{1,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 120);
  const candidates = paragraphs.length > 0 ? paragraphs : [text];

  const scored = candidates.map((p) => {
    const lower = p.toLowerCase();
    let score = 0;
    for (const t of terms) {
      const hits = lower.split(t).length - 1;
      if (hits > 0) score += 1 + Math.min(hits, 3) * 0.25;
    }
    return { text: p.slice(0, passageChars), score: score / terms.length };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPassages);
}