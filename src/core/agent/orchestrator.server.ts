import { loadConfig } from "@/core/config";
import { embedOne } from "@/core/providers/embeddings/index.server";
import { authorityScore } from "@/core/providers/search/registry.server";
import { sanitizeUntrusted } from "@/core/security/untrusted";
import { createToolRegistry } from "@/core/tools/implementations.server";
import type { ToolContext, ToolPermission } from "@/core/tools/registry";
import { analyzeIntent, proposeFollowUpQueries } from "./planner.server";
import { stripInvalidMarkers, synthesizeAnswer, verifyCitations } from "./synthesize.server";
import type {
  AgentEvent,
  AgentState,
  AgentTask,
  EvidenceItem,
  ResearchMode,
  RunResult,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface RunOptions {
  db: Db;
  userId: string;
  workspaceId: string;
  conversationId: string;
  question: string;
  mode: ResearchMode;
  history?: { role: string; content: string }[];
  workspaceInstructions?: string | null;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
}

const PERMISSIONS_BY_MODE: Record<ResearchMode, ToolPermission[]> = {
  quick: ["web.search", "web.read", "compute.safe", "db.read", "files.read"],
  deep: ["web.search", "web.read", "compute.safe", "db.read", "files.read"],
  files: ["files.read", "db.read", "compute.safe"],
  local: ["files.read", "db.read", "compute.safe"],
};

/**
 * The research pipeline:
 * planning → searching → reading → reasoning → verifying → answering → completed.
 * Every stage persists progress so a run is fully auditable and replayable.
 */
export async function runResearch(opts: RunOptions): Promise<RunResult> {
  const cfg = loadConfig();
  const started = Date.now();
  const registry = createToolRegistry();
  const tasks: AgentTask[] = [];
  const evidence: EvidenceItem[] = [];
  let marker = 0;

  const { data: runRow, error: runError } = await opts.db
    .from("agent_runs")
    .insert({
      workspace_id: opts.workspaceId,
      conversation_id: opts.conversationId,
      user_id: opts.userId,
      question: opts.question,
      mode: opts.mode,
      state: "planning",
      status: "running",
    })
    .select("id")
    .single();
  if (runError) throw new Error(`could not start run: ${runError.message}`);
  const runId = runRow.id as string;

  const emit = (event: AgentEvent) => opts.onEvent?.({ ...event, runId, at: new Date().toISOString() });
  emit({ type: "run_started" });

  const setState = async (state: AgentState) => {
    emit({ type: "state", state });
    await opts.db.from("agent_runs").update({ state }).eq("id", runId);
  };

  const audit = async (action: string, detail: unknown, severity: "info" | "warning" | "error" = "info") => {
    await opts.db.from("audit_events").insert({
      user_id: opts.userId,
      workspace_id: opts.workspaceId,
      run_id: runId,
      action,
      severity,
      detail: detail as Record<string, unknown>,
    });
  };

  const toolCtx: ToolContext = {
    userId: opts.userId,
    workspaceId: opts.workspaceId,
    runId,
    granted: PERMISSIONS_BY_MODE[opts.mode],
    signal: opts.signal,
    services: { db: opts.db, embed: embedOne },
    audit: async (entry) => {
      emit({ type: "tool_call", label: entry.toolName, detail: { status: entry.status, ms: entry.durationMs } });
      await opts.db.from("tool_calls").insert({
        run_id: runId,
        user_id: opts.userId,
        tool_name: entry.toolName,
        input: entry.input as Record<string, unknown>,
        output: entry.status === "ok" ? { ok: true } : null,
        status: entry.status,
        attempt: entry.attempt,
        duration_ms: entry.durationMs,
        error: entry.error ?? null,
      });
    },
  };

  const addTask = async (title: string, kind: AgentTask["kind"], query?: string) => {
    const position = tasks.length;
    const { data } = await opts.db
      .from("agent_tasks")
      .insert({ run_id: runId, user_id: opts.userId, position, title, kind, status: "running" })
      .select("id")
      .single();
    const task: AgentTask = { id: data?.id ?? `${position}`, position, title, kind, status: "running", query };
    tasks.push(task);
    emit({ type: "task", label: title, detail: task });
    return task;
  };
  const finishTask = async (task: AgentTask, status: AgentTask["status"], error?: string) => {
    task.status = status;
    if (error) task.error = error;
    await opts.db.from("agent_tasks").update({ status, error: error ?? null }).eq("id", task.id);
    emit({ type: "task", label: task.title, detail: task });
  };

  const failRun = async (message: string) => {
    await opts.db
      .from("agent_runs")
      .update({ state: "failed", status: "error", error: message, finished_at: new Date().toISOString() })
      .eq("id", runId);
    await audit("run_failed", { message }, "error");
    emit({ type: "error", label: message });
  };

  try {
    // ---- memories (long-term workspace context)
    const { data: memoryRows } = await opts.db
      .from("memories")
      .select("content")
      .eq("workspace_id", opts.workspaceId)
      .order("pinned", { ascending: false })
      .order("importance", { ascending: false })
      .limit(10);
    const memories = ((memoryRows ?? []) as { content: string }[]).map((m) => m.content);

    // ---- 1. planning
    await setState("planning");
    const intent = await analyzeIntent({
      question: opts.question,
      mode: opts.mode,
      history: opts.history,
      memories,
      maxQueries: cfg.limits.maxSearchQueries,
      signal: opts.signal,
    });
    emit({ type: "intent", detail: intent });

    const useKnowledge = opts.mode === "files" || opts.mode === "local" || intent.needsPrivateDocs;
    const useWeb = intent.needsWebResearch && intent.queries.length > 0 && opts.mode !== "files" && opts.mode !== "local";
    emit({
      type: "plan",
      detail: { queries: intent.queries, useWeb, useKnowledge, complexity: intent.complexity },
    });

    // ---- 2. knowledge base retrieval (RAG)
    if (useKnowledge) {
      const task = await addTask("Searching your documents", "kb_search", opts.question);
      try {
        const kb = await registry.execute<{ query: string; limit?: number }, {
          matches: { chunkId: string; fileId: string; fileName: string | null; page: number | null; content: string; similarity: number }[];
        }>("knowledge_search", { query: opts.question, limit: 8 }, toolCtx);
        for (const match of kb.matches) {
          marker += 1;
          evidence.push({
            marker,
            sourceId: "",
            url: null,
            title: match.fileName ?? "Uploaded document",
            domain: match.fileName ?? "document",
            author: null,
            publishedAt: null,
            retrievedAt: new Date().toISOString(),
            excerpt: sanitizeUntrusted(match.content).slice(0, 1800),
            kind: "file",
            fileId: match.fileId,
            page: match.page,
            authority: 0.8,
            relevance: match.similarity,
            injectionLabels: [],
          });
        }
        await finishTask(task, kb.matches.length > 0 ? "done" : "skipped");
      } catch (err) {
        await finishTask(task, "failed", (err as Error).message);
        emit({ type: "warning", label: `Document search unavailable: ${(err as Error).message}` });
      }
    }

    // ---- 3. web search + 4. reading
    const readUrls = new Set<string>();
    const runWebRound = async (queries: string[]) => {
      await setState("searching");
      const hits: { url: string; title: string; snippet: string; domain: string; publishedAt: string | null; authority: number }[] = [];
      for (const query of queries.slice(0, cfg.limits.maxSearchQueries)) {
        const task = await addTask(`Searching: ${query}`, "search", query);
        try {
          const out = await registry.execute<
            { query: string; limit?: number; freshness?: "day" | "week" | "month" | "year" },
            { hits: typeof hits; provider: string | null; errors: { provider: string; message: string }[] }
          >(
            "web_search",
            {
              query,
              limit: cfg.limits.maxSourcesPerQuery,
              ...(intent.needsFreshInfo ? { freshness: "month" as const } : {}),
            },
            toolCtx,
          );
          hits.push(...out.hits);
          await finishTask(task, out.hits.length > 0 ? "done" : "skipped");
          if (out.hits.length === 0) {
            emit({ type: "warning", label: `No results for "${query}"` });
          }
        } catch (err) {
          await finishTask(task, "failed", (err as Error).message);
          emit({ type: "warning", label: `Search failed for "${query}": ${(err as Error).message}` });
        }
      }

      // read the most promising unread pages
      await setState("reading");
      const candidates = hits
        .filter((h) => !readUrls.has(h.url))
        .sort((a, b) => b.authority - a.authority)
        .slice(0, cfg.limits.maxPagesRead);

      for (const hit of candidates) {
        readUrls.add(hit.url);
        const task = await addTask(`Reading ${hit.domain}`, "read", hit.url);
        try {
          const page = await registry.execute<
            { url: string; query: string },
            {
              url: string;
              domain: string;
              title: string | null;
              author: string | null;
              publishedAt: string | null;
              passages: { text: string; score: number }[];
              injectionLabels: string[];
              fetchedAt: string;
            }
          >("web_read", { url: hit.url, query: opts.question }, toolCtx);

          const excerpt = sanitizeUntrusted(page.passages.map((p) => p.text).join("\n\n")).slice(0, 2400);
          if (excerpt.trim().length < 80) {
            await finishTask(task, "skipped", "no relevant passage");
            continue;
          }
          marker += 1;
          evidence.push({
            marker,
            sourceId: "",
            url: page.url,
            title: page.title ?? hit.title,
            domain: page.domain,
            author: page.author,
            publishedAt: page.publishedAt ?? hit.publishedAt,
            retrievedAt: page.fetchedAt,
            excerpt,
            kind: "web",
            authority: authorityScore(page.url),
            relevance: page.passages[0]?.score ?? 0,
            injectionLabels: page.injectionLabels,
          });
          if (page.injectionLabels.length > 0) {
            await audit("injection_detected", { url: page.url, labels: page.injectionLabels }, "warning");
          }
          emit({
            type: "source",
            detail: { marker, url: page.url, title: page.title ?? hit.title, domain: page.domain },
          });
          await finishTask(task, "done");
        } catch (err) {
          await finishTask(task, "failed", (err as Error).message);
        }
      }

      // fall back to snippets when no page body could be read
      if (evidence.length === 0 && hits.length > 0) {
        for (const hit of hits.slice(0, 5)) {
          if (!hit.snippet?.trim()) continue;
          marker += 1;
          evidence.push({
            marker,
            sourceId: "",
            url: hit.url,
            title: hit.title,
            domain: hit.domain,
            author: null,
            publishedAt: hit.publishedAt,
            retrievedAt: new Date().toISOString(),
            excerpt: sanitizeUntrusted(hit.snippet).slice(0, 800),
            kind: "web",
            authority: hit.authority,
            relevance: 0.3,
            injectionLabels: [],
          });
          emit({ type: "source", detail: { marker, url: hit.url, title: hit.title, domain: hit.domain } });
        }
      }
    };

    if (useWeb) await runWebRound(intent.queries);

    // ---- 5. reasoning + 6. answering
    await setState("reasoning");
    const grounded = evidence.length > 0;

    // persist sources so citations can reference stable ids
    if (evidence.length > 0) {
      const { data: sourceRows, error: sourceError } = await opts.db
        .from("sources")
        .insert(
          evidence.map((e) => ({
            run_id: runId,
            workspace_id: opts.workspaceId,
            user_id: opts.userId,
            url: e.url,
            domain: e.domain,
            title: e.title,
            author: e.author,
            published_at: e.publishedAt,
            excerpt: e.excerpt.slice(0, 4000),
            kind: e.kind,
            file_id: e.fileId ?? null,
            relevance: e.relevance,
            authority: e.authority,
          })),
        )
        .select("id,url,domain,title");
      if (!sourceError) {
        const rows = (sourceRows ?? []) as { id: string; url: string | null; title: string }[];
        evidence.forEach((e, i) => {
          e.sourceId = rows[i]?.id ?? "";
        });
      }
    }

    await setState("answering");
    let synthesis = await synthesizeAnswer({
      question: opts.question,
      evidence,
      history: opts.history,
      memories,
      workspaceInstructions: opts.workspaceInstructions ?? null,
      grounded,
      signal: opts.signal,
    });

    // ---- deep-research loop: one extra round when evidence is thin
    const maxLoops = opts.mode === "deep" ? cfg.limits.maxResearchLoops : 0;
    let loops = 0;
    while (
      loops < maxLoops &&
      useWeb &&
      (synthesis.evaluation?.needsMoreResearch || evidence.length < 4)
    ) {
      loops += 1;
      const gaps = [
        ...(synthesis.evaluation?.uncertainties ?? []),
        ...(synthesis.evaluation?.contradictions ?? []),
      ];
      const followUpQueries = await proposeFollowUpQueries({
        question: opts.question,
        answerDraft: synthesis.answer,
        gaps: gaps.length > 0 ? gaps : ["insufficient corroborating sources"],
        limit: 3,
        signal: opts.signal,
      });
      if (followUpQueries.length === 0) break;
      await runWebRound(followUpQueries);
      await setState("answering");
      synthesis = await synthesizeAnswer({
        question: opts.question,
        evidence,
        history: opts.history,
        memories,
        workspaceInstructions: opts.workspaceInstructions ?? null,
        grounded: evidence.length > 0,
        signal: opts.signal,
      });
    }

    // ---- 7. verifying citations
    await setState("verifying");
    const cleanedAnswer = stripInvalidMarkers(synthesis.answer, evidence);
    const citations = evidence.length > 0 ? verifyCitations(cleanedAnswer, evidence) : [];
    if (citations.length > 0) {
      await opts.db.from("citations").insert(
        citations
          .filter((c) => evidence.some((e) => e.marker === c.marker && e.sourceId))
          .map((c) => ({
            run_id: runId,
            user_id: opts.userId,
            source_id: evidence.find((e) => e.marker === c.marker)!.sourceId,
            marker: c.marker,
            claim: c.claim,
            excerpt: c.excerpt,
            supported: c.supported,
          })),
      );
    }
    emit({ type: "evaluation", detail: synthesis.evaluation });

    const latencyMs = Date.now() - started;
    await opts.db
      .from("agent_runs")
      .update({
        state: "completed",
        status: "ok",
        final_answer: cleanedAnswer,
        provider: synthesis.provider,
        model: synthesis.model,
        loops,
        prompt_tokens: synthesis.promptTokens ?? null,
        completion_tokens: synthesis.completionTokens ?? null,
        latency_ms: latencyMs,
        self_eval: synthesis.evaluation as unknown as Record<string, unknown>,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    await audit("run_completed", {
      mode: opts.mode,
      sources: evidence.length,
      citations: citations.length,
      loops,
      provider: synthesis.provider,
    });
    emit({ type: "done" });

    return {
      runId,
      answer: cleanedAnswer,
      evidence,
      citations,
      evaluation: synthesis.evaluation,
      followUps: synthesis.followUps,
      provider: synthesis.provider,
      model: synthesis.model,
      isLocalOnly: synthesis.isLocal && evidence.length === 0,
      state: "completed",
      latencyMs,
    };
  } catch (err) {
    await failRun((err as Error).message);
    throw err;
  }
}
