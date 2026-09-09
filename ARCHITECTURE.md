# CIEL: Cited AI Research Agent — Architecture

## Overview

**CIEL** is a full-stack, evidence-driven AI research agent that performs web searches, reads sources, collects citations, and synthesizes cited answers. Every claim is traceable to retrieved evidence.

The system is **provider-agnostic** — swap LLM providers (Lovable, Ollama, etc.), search engines (Tavily, Brave, DuckDuckGo), and embeddings without rewriting business logic.

---

## High-Level Flow

```
User Question
    ↓
[Planning Phase] - Analyze intent, decide research mode, generate queries
    ↓
[Knowledge Phase] - Search user's uploaded docs (if enabled)
    ↓
[Web Phase] - Execute multi-query web search (if web research enabled)
    ↓
[Reading Phase] - Fetch & extract passages from retrieved pages
    ↓
[Reasoning Phase] - Synthesize answer grounded in evidence
    ↓
[Verification Phase] - Map citations to evidence, verify claims
    ↓
[Response] - Return answer with inline [n] markers + sources list
```

---

## Core Components

### 1. **Agent Orchestrator** (`src/core/agent/orchestrator.server.ts`)

**Responsibility:** Coordinates entire research pipeline.

**Key Methods:**
- `runResearch(opts)` — Entry point; manages state machine, persists progress to database

**State Machine:**
```
planning → searching → reading → reasoning → verifying → answering → completed
                                                                    ↓
                                                     (deep mode) → more rounds
```

**Persistance:**
- Creates `agent_runs` row (one per user question)
- Logs all `agent_tasks` (search, read, compute, etc.)
- Stores `tool_calls` and `audit_events` for replay

**Core Loop:**
1. Plan: Analyze question intent, generate search queries
2. Search: Retrieve hit list from configured search providers (fallback: DuckDuckGo)
3. Read: Fetch pages, extract relevant passages
4. Reason: Synthesize answer using collected evidence
5. (Deep mode only) Verify citations, propose follow-ups, loop if needed
6. Verify: Map `[n]` markers back to exact evidence passages
7. Persist: Save run, sources, citations

---

### 2. **Planning** (`src/core/agent/planner.server.ts`)

**Responsibility:** Analyze user intent and propose research strategy.

**Key Functions:**
- `analyzeIntent()` — Determines:
  - `needsWebResearch` — Does question require live data?
  - `needsFreshInfo` — Limit results to recent articles?
  - `needsPrivateDocs` — Does user want knowledge base search?
  - `complexity` — Decide routing to stronger/lighter models
  - `queries[]` — Generate 1–N search queries for complex questions

- `proposeFollowUpQueries()` — If evidence gaps detected, generate refined queries

---

### 3. **Synthesis & Verification** (`src/core/agent/synthesize.server.ts`)

**Responsibility:** Turn evidence into cited answers.

**Key Functions:**
- `synthesizeAnswer()` — Call configured LLM with:
  - User question
  - Evidence passages + markers
  - Workspace instructions
  - Chat history (for context)
  - Output: Markdown with `[n]` inline citations

- `verifyCitations()` — For each `[n]` marker in answer:
  - Extract the claim it supports
  - Find corresponding evidence passage
  - Verify marker ↔ passage consistency
  - Store `ClaimCitation` record

- `stripInvalidMarkers()` — Remove markers that point to missing or irrelevant evidence

**Self-Evaluation:**
Before finalizing, evaluate:
- Did agent answer user's question?
- Are claims sufficiently supported?
- Are sources diverse & authoritative?
- Any contradictions or uncertainties?
- Should run loop (deep mode)?

---

### 4. **Search Provider Registry** (`src/core/providers/search/registry.server.ts`)

**Responsibility:** Multi-provider search with automatic fallback.

**Supported Providers:**
- **Tavily** — Paid, fast, real-time web search
- **Brave Search** — Paid, privacy-focused
- **DuckDuckGo** — Free, no API key needed (fallback default)
- **Wikipedia** — Local in-memory fallback for factual questions

**Features:**
- Provider order configurable via `SEARCH_PROVIDER_ORDER` env var
- Automatic fallback on timeout/error
- Hit deduplication
- Authority scoring per domain (trusted > unknown)
- Freshness filtering (day/week/month/year)

**Tool Interface:**
```typescript
execute("web_search", { 
  query: string, 
  limit: number, 
  freshness?: "day" | "week" | "month" | "year" 
})
→ { hits, provider, errors }
```

---

### 5. **Web Reading** (`src/core/providers/reader/`)

**Responsibility:** Fetch pages, extract passages, detect injection attempts.

**Features:**
- Safe HTTP fetching (timeout, size limits)
- HTML parsing & content extraction
- Passage ranking (semantic relevance to query)
- Prompt injection detection (labels suspicious content)
- Author/publication date extraction where available

**Tool Interface:**
```typescript
execute("web_read", { url, query })
→ { url, domain, title, author, publishedAt, passages, injectionLabels }
```

---

### 6. **LLM Provider Router** (`src/core/providers/llm/router.server.ts`)

**Responsibility:** Select best LLM for task, with fallback.

**Provider Adapters:**
- **Lovable** — Proxy LLM service (supports multiple models: Gemini, Claude, etc.)
- **Ollama** — Local open-source models (llama3.1, mistral, etc.)

**Model Roles:**
```typescript
{
  fast: "for quick classification & extraction",
  reasoning: "for complex synthesis & planning",
  extract: "for passage ranking & key info",
  embed: "for semantic similarity & retrieval"
}
```

**Routing Logic:**
1. Try first provider in `LLM_PROVIDER_ORDER`
2. If timeout/error, try next
3. Fall back to local Ollama if configured
4. Raise error if all exhausted

---

### 7. **Tool System** (`src/core/tools/`)

**Responsibility:** Centralized tool registry with permission model.

**Tool Permissions by Mode:**

| Mode   | Permissions |
|--------|-------------|
| quick  | web.search, web.read, compute.safe, db.read, files.read |
| deep   | (same as quick) |
| files  | files.read, db.read, compute.safe |
| local  | files.read, db.read, compute.safe |

**Built-in Tools:**
- `web_search` — Multi-provider search
- `web_read` — Page reader with injection defense
- `knowledge_search` — Vector/semantic search over uploaded docs
- `compute.safe` — Limited math/logic evaluation

**Tool Execution Harness:**
```typescript
registry.execute(toolName, args, context)
→ Validates permissions, executes, logs, handles errors
```

---

### 8. **RAG & Document Intelligence** (`src/core/rag/`)

**Responsibility:** Upload, chunk, embed, and search user documents.

**Supported Formats:**
- PDF, DOCX, XLSX, CSV, TXT, Markdown
- Images (OCR where practical)

**Pipeline:**
1. **Ingestion:** Upload → Validate → Extract text → Chunk (512-token windows)
2. **Embedding:** Generate embeddings via configured provider (local Ollama or Lovable)
3. **Storage:** Chunk metadata + vectors in Supabase pgvector
4. **Retrieval:** Semantic search on user query
5. **Citation:** Track document + page for every match

**Key Tables:**
- `files` — Upload metadata (user, workspace, status)
- `chunks` — Text chunks (file_id, content, embeddings, page)
- `chunk_access` — Workspace/user permissions

---

### 9. **Security Layer** (`src/core/security/`)

**Components:**

1. **Prompt Injection Defense** (`untrusted.ts`)
   - HTML sanitization on all web content
   - Label suspicious patterns (URLs in text, repeated keywords)
   - Never pass raw web content to LLM without cleaning

2. **Workspace Isolation**
   - Every user has 1+ workspaces
   - Every file/memory/conversation scoped to workspace
   - Database queries enforce `workspace_id = ?`

3. **Tool Permission Model**
   - Each tool has required permissions
   - Agent checks permissions before execution
   - Audit log every tool call

4. **Input Validation**
   - Zod schemas for all inputs
   - Max lengths enforced (4KB question, 12KB extract, etc.)

---

### 10. **Database Schema** (`supabase/migrations/`)

**Core Tables:**

```sql
users
├─ id, created_at

workspaces
├─ id, owner_id, name, description, instructions, local_mode

conversations
├─ id, workspace_id, user_id, title, mode, archived, created_at, updated_at

messages
├─ id, conversation_id, user_id, role, content, data (JSON), run_id, created_at

agent_runs
├─ id, conversation_id, workspace_id, user_id
├─ question, mode, state, status
├─ sources_count, citations_count, loops
├─ final_answer, provider, model, prompt_tokens, completion_tokens
├─ self_eval (JSON), error, latency_ms, started_at, finished_at

agent_tasks
├─ id, run_id, position, title, kind, status, query, error

tool_calls
├─ id, run_id, user_id, tool_name, input (JSON), output (JSON)
├─ status, attempt, duration_ms, error

sources
├─ id, run_id, workspace_id, user_id
├─ url, domain, title, author, published_at, excerpt, kind (web|file)
├─ file_id, relevance, authority

citations
├─ id, run_id, source_id, marker, claim, excerpt, supported

audit_events
├─ id, user_id, workspace_id, run_id
├─ action, severity, detail (JSON), created_at

memories
├─ id, workspace_id, user_id, content, kind, pinned, importance, created_at

files
├─ id, workspace_id, user_id, name, type, size, status, created_at

chunks
├─ id, file_id, content, embeddings (pgvector), page, created_at
```

---

## Configuration System (`src/core/config.ts`)

**Fully Environment-Driven:**

All providers, models, limits, and features configured via env vars:

```env
# LLM Providers
LLM_PROVIDER_ORDER=lovable,ollama
MODEL_FAST=google/gemini-3.1-flash-lite
MODEL_REASONING=google/gemini-3.6-flash
LOVABLE_API_KEY=xxx

# Search Providers
SEARCH_PROVIDER_ORDER=tavily,brave,duckduckgo
TAVILY_API_KEY=xxx
BRAVE_SEARCH_API_KEY=xxx

# Embeddings
EMBEDDINGS_PROVIDER_ORDER=lovable,ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434

# Agent Limits
AGENT_MAX_QUERIES=5
AGENT_MAX_PAGES=8
AGENT_MAX_EXTRACT_CHARS=12000

# Features
ENABLE_BROWSER_AUTOMATION=0
ENABLE_MULTI_MODEL_COMPARE=1
AGENT_LOCAL_MODE=0

# n8n Integration
N8N_WEBHOOK_URL=
```

No hardcoding of providers in UI/business logic — adapters read config on startup.

---

## Research Modes

### Quick Search
- Single-round research
- 1–3 queries max
- Fast web search → read top hits → synthesize
- ~5–10 seconds typical

### Deep Research
- Iterative multi-round
- Up to `AGENT_MAX_LOOPS` rounds (default 2)
- After synthesis, evaluates sufficiency
- If gaps detected, proposes follow-ups and searches again
- Self-evaluation detects:
  - Contradictions in evidence
  - Unsupported claims
  - Uncertainty levels
  - Source diversity

### Knowledge Research
- Skip web search entirely
- Query user's uploaded documents
- Same citation pipeline applies

### Local Research
- No live web search
- Local LLM only
- Local knowledge base only
- Fully offline capable

---

## Extensibility Points

### Add a New LLM Provider

1. Create `src/core/providers/llm/yourprovider.server.ts`
2. Implement interface:
   ```typescript
   export interface LlmAdapter {
     callLlm(prompt, model, signal?): Promise<{ text, tokens }>
   }
   ```
3. Register in `router.server.ts`
4. Add env var: `LOVABLE_API_KEY` → `YOUR_PROVIDER_API_KEY`
5. No other code changes needed

### Add a New Search Provider

1. Create `src/core/providers/search/yourprovider.server.ts`
2. Implement interface:
   ```typescript
   export interface SearchAdapter {
     search(query, limit, signal?): Promise<{ hits, errors }>
   }
   ```
3. Register in `registry.server.ts`
4. Add env var: `YOUR_PROVIDER_API_KEY`
5. Optionally tune authority scoring

### Add a New Tool

1. Create tool file under `src/core/tools/`
2. Implement tool interface:
   ```typescript
   export interface Tool {
     name: string
     description: string
     inputSchema: JsonSchema
     handler(args, context): Promise<result>
   }
   ```
3. Register in `implementations.server.ts`
4. Declare required permissions
5. Tool is automatically available to agent

### Add a New Document Format

1. Extend `src/core/rag/extractors/`
2. Implement extractor interface
3. Register in dispatcher
4. RAG pipeline automatically handles format

---

## Error Handling & Recovery

**Search Provider Fails:**
→ Try next in `SEARCH_PROVIDER_ORDER`
→ If all fail, fall back to snippet-based evidence

**LLM Provider Timeout:**
→ Try next in `LLM_PROVIDER_ORDER`
→ If all fail, raise error with context

**Page Read Fails:**
→ Skip page, continue with others
→ If no pages readable, fall back to search snippets

**Evidence Insufficient:**
→ Deep mode: Propose follow-ups and re-search
→ Quick mode: Return answer with uncertainty flag

**Tool Permission Denied:**
→ Log audit event
→ Skip tool, try alternative
→ Include limitation in self-evaluation

---

## Observability & Auditing

Every agent run produces:

1. **Run Record** — Question, mode, final state, latency, token usage
2. **Task Log** — Every search/read/compute step with status
3. **Tool Calls** — Every tool invocation, args, result, timing
4. **Audit Trail** — Permission checks, injection detections, errors
5. **Self-Evaluation** — Gaps, contradictions, certainty levels

**Developer/Admin View:**
- View any run by ID
- Replay entire pipeline
- Audit user actions
- Debug tool failures

---

## Deployment

### Local Development
```bash
npm install
npm run dev
# Requires: .env with SUPABASE_URL, SUPABASE_KEY, optionally LOVABLE_API_KEY
# Optional: Local Ollama for AGENT_LOCAL_MODE=1
```

### Production
- Deploy frontend to Vercel / Cloudflare Pages
- Deploy API (`src/server.ts`) to Vercel Edge / Cloudflare Workers
- Attach Supabase backend (hosted or self-hosted)
- Configure provider API keys as env vars (never in code)
- Enable audit logging and observability

---

## Known Limitations

1. **Browser Automation:** Not yet implemented (scaffold ready, enable with `ENABLE_BROWSER_AUTOMATION=1`)
2. **N8n Integration:** Scaffold ready; add real integration if needed
3. **Multi-model Comparison:** Optional feature (`ENABLE_MULTI_MODEL_COMPARE=1`)
4. **Scheduled Tasks:** Background job queue designed but not fully implemented

---

## Testing

**Unit Tests:**
- Query planning
- Citation verification
- Injection detection
- Permission checks

**Integration Tests:**
- End-to-end research pipeline
- Fallback behavior
- Provider switching
- Database persistence

Run: `npm test` (TODO: add test suite)

---

## Contributing

1. **No hardcoded providers** — Use config layer
2. **Always sandbox tools** — Validate inputs, handle failures
3. **Log audit events** — Every user action gets an entry
4. **Test fallbacks** — Assume external services fail
5. **Update schema docs** — If DB changes, document new columns

---

## License

MIT. See LICENSE file.
