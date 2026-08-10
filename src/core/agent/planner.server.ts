import { parseJsonLoose, routeCompletion } from "@/core/providers/llm/router.server";
import type { Intent, ResearchMode } from "./types";

const INTENT_SYSTEM = `You are the planning stage of a research agent.
Analyse the user's request and answer ONLY with JSON:
{"goal":"one sentence restatement","needsWebResearch":bool,"needsFreshInfo":bool,"needsPrivateDocs":bool,"complexity":"simple|moderate|complex","domain":"short topic label","queries":["search query", ...],"clarifyingNote":"optional short note"}
Rules:
- needsWebResearch is false ONLY for greetings, chit-chat, opinion/creative writing, or arithmetic that needs no facts.
- queries must be independent, high-signal web search queries (1 for simple, 2-3 for moderate, 3-6 for complex). Empty array when no research is needed.
- Never include commentary outside the JSON.`;

export async function analyzeIntent(opts: {
  question: string;
  mode: ResearchMode;
  history?: { role: string; content: string }[];
  memories?: string[];
  maxQueries: number;
  signal?: AbortSignal;
}): Promise<Intent> {
  const context = [
    opts.history?.length
      ? `Recent conversation:\n${opts.history.slice(-6).map((m) => `${m.role}: ${m.content.slice(0, 500)}`).join("\n")}`
      : "",
    opts.memories?.length ? `Known user context:\n- ${opts.memories.slice(0, 8).join("\n- ")}` : "",
    `Mode: ${opts.mode}`,
    `Request: ${opts.question}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let intent: Intent | null = null;
  try {
    const res = await routeCompletion({
      role: "fast",
      json: true,
      temperature: 0.1,
      maxTokens: 700,
      signal: opts.signal,
      messages: [
        { role: "system", content: INTENT_SYSTEM },
        { role: "user", content: context },
      ],
    });
    intent = parseJsonLoose<Intent>(res.text);
  } catch {
    intent = null;
  }

  const fallbackNeedsWeb = opts.mode !== "local" && opts.question.trim().split(/\s+/).length > 2;
  const normalized: Intent = {
    goal: intent?.goal?.trim() || opts.question.slice(0, 300),
    needsWebResearch:
      opts.mode === "files" || opts.mode === "local"
        ? false
        : (intent?.needsWebResearch ?? fallbackNeedsWeb),
    needsFreshInfo: intent?.needsFreshInfo ?? /\b(today|latest|current|2025|2026|now|recent|news)\b/i.test(opts.question),
    needsPrivateDocs: opts.mode === "files" ? true : (intent?.needsPrivateDocs ?? false),
    complexity: intent?.complexity ?? (opts.mode === "deep" ? "complex" : "moderate"),
    domain: intent?.domain ?? "general",
    queries: dedupeQueries(
      (intent?.queries ?? []).filter((q) => typeof q === "string" && q.trim().length > 1),
      opts.question,
      opts.mode,
      opts.maxQueries,
    ),
    clarifyingNote: intent?.clarifyingNote,
  };
  if (!normalized.needsWebResearch && opts.mode !== "deep") normalized.queries = [];
  return normalized;
}

function dedupeQueries(queries: string[], question: string, mode: ResearchMode, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of [...queries, question]) {
    const key = q.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(q.trim().slice(0, 300));
    if (out.length >= (mode === "deep" ? max : Math.min(max, 3))) break;
  }
  return out;
}

/** Follow-up query expansion used by deep research when gaps remain. */
export async function proposeFollowUpQueries(opts: {
  question: string;
  answerDraft: string;
  gaps: string[];
  limit: number;
  signal?: AbortSignal;
}): Promise<string[]> {
  try {
    const res = await routeCompletion({
      role: "fast",
      json: true,
      temperature: 0.2,
      maxTokens: 400,
      signal: opts.signal,
      messages: [
        {
          role: "system",
          content:
            'Propose additional web search queries that close the listed evidence gaps. Answer only with JSON: {"queries":["..."]}',
        },
        {
          role: "user",
          content: `Question: ${opts.question}\n\nGaps:\n- ${opts.gaps.join("\n- ")}\n\nDraft answer (may be incomplete):\n${opts.answerDraft.slice(0, 2000)}`,
        },
      ],
    });
    const parsed = parseJsonLoose<{ queries?: string[] }>(res.text);
    return (parsed?.queries ?? []).filter((q) => typeof q === "string" && q.trim()).slice(0, opts.limit);
  } catch {
    return [];
  }
}
