/**
 * SSRF protection for every outbound fetch the agent performs on
 * model- or web-derived URLs.
 */
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /^\[?::1\]?$/,
  /^fe80:/i,
  /^fc00:/i,
  /\.local$/i,
  /^metadata\.google\.internal$/i,
];

export interface UrlCheck {
  ok: boolean;
  reason?: string;
  url?: URL;
}

export function checkOutboundUrl(raw: string, allowedDomains?: string[]): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "malformed url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `blocked protocol ${url.protocol}` };
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOST_PATTERNS.some((p) => p.test(host))) {
    return { ok: false, reason: "private or loopback address blocked" };
  }
  if (url.port && !["80", "443", "8080", ""].includes(url.port)) {
    return { ok: false, reason: `blocked port ${url.port}` };
  }
  if (allowedDomains && allowedDomains.length > 0) {
    const allowed = allowedDomains.some(
      (d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`),
    );
    if (!allowed) return { ok: false, reason: `domain ${host} not in allow-list` };
  }
  return { ok: true, url };
}

export function domainOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}