import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowUp, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { RESEARCH_MODES, type ResearchMode } from "@/core/agent/types";
import { askQuestion } from "@/lib/research.functions";
import { AnswerMarkdown } from "./markdown";
import { SourceCards, type SourceCardData } from "./source-cards";

export interface ChatMessageView {
  id: string;
  role: string;
  content: string;
  data?: {
    sources?: SourceCardData[];
    followUps?: string[];
    evaluation?: {
      sourceDiversity?: number;
      contradictions?: string[];
      uncertainties?: string[];
      limitations?: string[];
      needsMoreResearch?: boolean;
    } | null;
    provider?: string;
    model?: string;
    mode?: string;
    error?: string;
    latencyMs?: number;
  } | null;
}

const STAGES = [
  "Understanding your question",
  "Searching the web",
  "Reading sources",
  "Comparing evidence",
  "Verifying citations",
  "Writing the answer",
];

export function ChatView({
  workspaceId,
  conversationId,
  initialMessages,
  initialMode = "quick",
}: {
  workspaceId: string;
  conversationId: string | null;
  initialMessages: ChatMessageView[];
  initialMode?: ResearchMode;
}) {
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ResearchMode>(initialMode);
  const [stage, setStage] = useState(0);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ask = useServerFn(askQuestion);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMessages(initialMessages), [initialMessages]);

  const mutation = useMutation({
    mutationFn: (vars: { question: string; mode: ResearchMode }) =>
      ask({ data: { conversationId, workspaceId, question: vars.question, mode: vars.mode } }),
    onSuccess: async (result) => {
      setMessages((prev) => [
        ...prev,
        {
          id: result.messageId ?? crypto.randomUUID(),
          role: "assistant",
          content: result.answer,
          data: {
            sources: result.sources as SourceCardData[],
            followUps: result.followUps,
            evaluation: result.evaluation,
            provider: result.provider,
            model: result.model,
            mode: result.mode,
            latencyMs: result.latencyMs,
          },
        },
      ]);
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (!conversationId && result.conversationId) {
        navigate({ to: "/research/$conversationId", params: { conversationId: result.conversationId } });
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Research run failed");
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `I couldn't complete this run: ${error.message}`,
          data: { error: error.message },
        },
      ]);
    },
  });

  const isRunning = mutation.isPending;

  useEffect(() => {
    if (!isRunning) {
      setStage(0);
      return;
    }
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 3500);
    return () => clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isRunning]);

  const submit = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || isRunning) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: trimmed }]);
    setInput("");
    mutation.mutate({ question: trimmed, mode });
  };

  const activeMode = useMemo(() => RESEARCH_MODES.find((m) => m.id === mode)!, [mode]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto w-full max-w-3xl space-y-8">
          {messages.length === 0 && !isRunning ? (
            <EmptyState onPick={submit} />
          ) : null}

          {messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                  {message.content}
                </p>
              </div>
            ) : (
              <article key={message.id} className="space-y-4">
                {message.data?.sources?.length ? (
                  <section className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Sources
                    </h2>
                    <SourceCards sources={message.data.sources} />
                  </section>
                ) : null}

                <AnswerMarkdown
                  text={message.content}
                  sources={message.data?.sources}
                  onCitationClick={(marker) =>
                    document.getElementById(`source-${marker}`)?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    })
                  }
                />

                {message.data?.evaluation ? <EvaluationNote evaluation={message.data.evaluation} /> : null}

                <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-muted-foreground">
                  {message.data?.mode ? <span>{message.data.mode} mode</span> : null}
                  {message.data?.model ? <span>{message.data.model}</span> : null}
                  {message.data?.sources ? <span>{message.data.sources.length} sources</span> : null}
                  {message.data?.latencyMs ? <span>{Math.round(message.data.latencyMs / 100) / 10}s</span> : null}
                </footer>

                {message.data?.followUps?.length ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {message.data.followUps.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => submit(f)}
                        className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            ),
          )}

          {isRunning ? (
            <div className="space-y-2 rounded-xl border border-border bg-card/50 p-4">
              {STAGES.map((label, i) => (
                <div
                  key={label}
                  className={`flex items-center gap-2 text-sm ${
                    i < stage ? "text-muted-foreground" : i === stage ? "text-foreground" : "text-muted-foreground/40"
                  }`}
                >
                  {i === stage ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                  {label}
                </div>
              ))}
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-border bg-background/80 px-4 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {RESEARCH_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                title={m.description}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  mode === m.id
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              rows={1}
              placeholder={`Ask anything — ${activeMode.description.toLowerCase()}`}
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={isRunning || !input.trim()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
            >
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </form>
          <p className="text-center text-[0.7rem] text-muted-foreground">
            Answers cite real retrieved sources. Verify anything critical.
          </p>
        </div>
      </div>
    </div>
  );
}

function EvaluationNote({
  evaluation,
}: {
  evaluation: NonNullable<NonNullable<ChatMessageView["data"]>["evaluation"]>;
}) {
  const notes = [
    ...(evaluation.contradictions ?? []).map((c) => `Sources disagree: ${c}`),
    ...(evaluation.uncertainties ?? []).map((u) => `Uncertain: ${u}`),
    ...(evaluation.limitations ?? []),
  ].slice(0, 4);
  if (notes.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5" />
        Verification notes
      </div>
      <ul className="mt-2 ml-4 list-disc space-y-1 text-xs text-muted-foreground">
        {notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

const EXAMPLES = [
  "What changed in EU AI Act enforcement this year?",
  "Compare Postgres pgvector with dedicated vector databases",
  "Summarise the latest research on sleep and memory consolidation",
];

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="space-y-6 py-10 text-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" /> Evidence-first research
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">What should Sutradhar research?</h1>
      <p className="mx-auto max-w-md text-sm text-muted-foreground">
        Every factual claim is grounded in sources that were actually retrieved and read — never invented.
      </p>
      <div className="mx-auto grid max-w-xl gap-2">
        {EXAMPLES.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            className="rounded-xl border border-border px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
