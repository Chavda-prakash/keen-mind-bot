export const AGENT_STATES = [
  "planning",
  "searching",
  "reading",
  "reasoning",
  "verifying",
  "answering",
  "acting",
  "completed",
  "failed",
  "cancelled",
  "awaiting_approval",
] as const;

export type AgentState = (typeof AGENT_STATES)[number];

/** User-facing labels — high-level progress only, never chain-of-thought. */
export const STATE_LABELS: Record<AgentState, string> = {
  planning: "Understanding request and planning research",
  searching: "Searching sources",
  reading: "Reading sources",
  reasoning: "Comparing evidence",
  verifying: "Verifying citations",
  answering: "Generating answer",
  acting: "Running tools",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  awaiting_approval: "Waiting for your approval",
};

export type ResearchMode = "quick" | "deep" | "files" | "local";

export const RESEARCH_MODES: { id: ResearchMode; label: string; description: string }[] = [
  { id: "quick", label: "Quick Search", description: "Fast web-grounded answer with citations" },
  { id: "deep", label: "Deep Research", description: "Multi-query, multi-source, iterative research" },
  { id: "files", label: "Knowledge Research", description: "Answer from your uploaded documents" },
  { id: "local", label: "Local Research", description: "Local model + local knowledge only (no live web)" },
];

export type TaskKind = "search" | "read" | "kb_search" | "compute" | "synthesize" | "verify" | "tool";
export type TaskStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface AgentTask {
  id: string;
  position: number;
  title: string;
  kind: TaskKind;
  status: TaskStatus;
  query?: string | undefined;
  toolName?: string | undefined;
  result?: unknown;
  error?: string | undefined;
}

export interface Intent {
  /** short restatement of what the user actually wants */
  goal: string;
  needsWebResearch: boolean;
  needsFreshInfo: boolean;
  needsPrivateDocs: boolean;
  complexity: "simple" | "moderate" | "complex";
  domain: string;
  queries: string[];
  clarifyingNote?: string | undefined;
}

export interface EvidenceItem {
  /** stable citation marker rendered as [n] */
  marker: number;
  sourceId: string;
  url: string | null;
  title: string;
  domain: string;
  author: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  excerpt: string;
  kind: "web" | "file";
  fileId?: string | null;
  page?: number | null;
  authority: number;
  relevance: number;
  injectionLabels: string[];
}

export interface ClaimCitation {
  marker: number;
  claim: string;
  excerpt: string;
  supported: boolean;
}

export interface SelfEvaluation {
  answeredRequest: boolean;
  sufficientlySupported: boolean;
  citationsAttached: boolean;
  sourceDiversity: number;
  contradictions: string[];
  uncertainties: string[];
  needsMoreResearch: boolean;
  limitations: string[];
}

export interface AgentEvent {
  type:
    | "run_started"
    | "state"
    | "intent"
    | "plan"
    | "task"
    | "tool_call"
    | "source"
    | "answer_chunk"
    | "answer"
    | "evaluation"
    | "warning"
    | "error"
    | "done";
  runId?: string;
  state?: AgentState;
  label?: string;
  detail?: unknown;
  at?: string;
}

export interface RunResult {
  runId: string;
  answer: string;
  evidence: EvidenceItem[];
  citations: ClaimCitation[];
  evaluation: SelfEvaluation | null;
  followUps: string[];
  provider: string;
  model: string;
  isLocalOnly: boolean;
  state: AgentState;
  latencyMs: number;
}