# CIEL: Cited AI Research Agent

An open-source, **evidence-driven AI research agent** that performs web searches, reads sources, collects citations, and synthesizes **cited answers** with inline `[n]` markers you can click to verify.

Every factual claim is traceable to retrieved evidence. No invented citations. No hallucinated sources.

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)
![TanStack Start](https://img.shields.io/badge/Framework-TanStack%20Start-blueviolet.svg)

---

## 🎯 Features

✅ **Real Web Search**
- Multi-provider search (Tavily, Brave, DuckDuckGo with automatic fallback)
- No invented results
- Fresh information filtering
- Provider failover when one is down

✅ **Verified Citations**
- Every `[n]` marker maps to exact evidence passage
- Claims linked to retrieved sources
- Self-evaluation detects unsupported statements
- Citation verification before finalizing answer

✅ **Your Documents** (RAG)
- Upload PDFs, DOCX, images, spreadsheets
- Semantic search over your knowledge base
- Same citation pipeline applies
- Document-level and page-level tracking

✅ **Multiple Research Modes**
- **Quick**: Fast single-pass research
- **Deep**: Multi-round iterative research with self-evaluation
- **Knowledge**: Search only your uploaded documents
- **Local**: Offline mode (local LLM + local knowledge)

✅ **Transparent Agent Architecture**
- State machine: planning → searching → reading → reasoning → verifying → answering
- Full pipeline auditability
- Every tool call logged
- Self-evaluation before finalizing answer
- Provider/model agnostic design

✅ **Extensible & Decoupled**
- Swap LLM providers without rewriting code
- Add search engines via adapter interface
- Plug new tools into registry
- Local-first architecture (Ollama compatible)

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ or **Bun**
- **Supabase** account (free tier works) OR local Postgres
- Optional: Lovable API key, Tavily/Brave search keys, local Ollama

### Installation

```bash
# Clone the repository
git clone https://github.com/Chavda-prakash/keen-mind-bot.git
cd keen-mind-bot

# Install dependencies
npm install
# or
bun install

# Copy example config
cp .env.example .env

# Edit .env with your credentials
nano .env

# Start development server
npm run dev
```

**Open:** `http://localhost:5173`

---

## 🔧 Configuration

All configuration is **environment-driven** and read-only. No secrets in frontend code.

### Core Environment Variables

```bash
# Supabase (Required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_anon_key

# LLM Providers (at least one)
LOVABLE_API_KEY=your_api_key              # Paid proxy service
AGENT_LOCAL_MODE=0                        # Set to 1 for local Ollama

# Search Providers (optional; DuckDuckGo is free fallback)
TAVILY_API_KEY=your_api_key
BRAVE_SEARCH_API_KEY=your_api_key

# Model Configuration (optional)
MODEL_FAST=google/gemini-3.1-flash-lite
MODEL_REASONING=google/gemini-3.6-flash

# Agent Limits (optional)
AGENT_MAX_QUERIES=5                       # Max search queries per research round
AGENT_MAX_PAGES=8                         # Max pages to read
AGENT_MAX_LOOPS=2                         # Deep research iterations
AGENT_FETCH_TIMEOUT_MS=12000
```

See **[.env.example](.env.example)** for all options.

---

## 📖 Usage

### Via Web Interface

1. **Landing Page** — Overview of features
2. **Start Researching** — Choose research mode:
   - Quick Search (fast, single pass)
   - Deep Research (iterative, self-evaluating)
   - Knowledge Files (your docs only)
   - Local Research (offline)
3. **Ask Question** — Get cited answer in seconds
4. **Inspect Sources** — Click `[n]` markers to view evidence

### Via API (Server Functions)

```typescript
import { askQuestion } from "@/lib/research.functions";

const result = await askQuestion({
  conversationId: "uuid-or-null",  // null = new conversation
  workspaceId: "uuid",
  question: "How does photosynthesis work?",
  mode: "quick"                     // "quick" | "deep" | "files" | "local"
});

// Result contains:
// - answer: string (with [n] markers)
// - sources: Array<{url, title, domain, excerpt}>
// - citations: Array<{marker, claim, excerpt, supported}>
// - evaluation: {answeredRequest, sufficientlySupported, ...}
// - followUps: string[]
```

---

## 🏗️ Architecture

**10,000-foot view:**

```
┌─────────────┐
│   React UI  │ (TanStack Start, Radix UI)
└──────┬──────┘
       │
┌──────▼───────────────────────────────────────┐
│  Server-Side Agent Pipeline (TypeScript)     │
│                                               │
│  1. Planning       → Analyze intent & queries │
│  2. Knowledge      → Search user docs (RAG)   │
│  3. Web Search     → Multi-provider search    │
│  4. Reading        → Fetch & extract pages    │
│  5. Reasoning      → LLM synthesis            │
│  6. Verification   → Citation verification    │
│  7. Persistence    → Save to database         │
└──────┬───────────────────────────────────────┘
       │
┌──────▼──────────────────┬──────────────┬────────────────┐
│   Supabase              │  LLM Router  │  Search Router │
│   (PostgreSQL + Auth)   │  (Lovable,   │  (Tavily,      │
│                         │   Ollama)    │   Brave, DDG)  │
└─────────────────────────┴──────────────┴────────────────┘
```

**Key Design Principles:**

- ✅ **Provider-agnostic** — Swap LLM/search providers without code changes
- ✅ **Transparent** — Every step logged, auditable, replayable
- ✅ **Fault-tolerant** — Provider failures trigger fallback, never fake results
- ✅ **Local-first** — Works offline with Ollama + local knowledge base
- ✅ **Extensible** — Add tools, search providers, LLM adapters via interfaces

**Full Architecture:** See [ARCHITECTURE.md](ARCHITECTURE.md)

---

## 📂 Project Structure

```
keen-mind-bot/
├── src/
│   ├── core/
│   │   ├── agent/              Agent orchestrator & state machine
│   │   │   ├── orchestrator.server.ts    Main research pipeline
│   │   │   ├── planner.server.ts         Intent analysis & query gen
│   │   │   ├── synthesize.server.ts      LLM synthesis & verification
│   │   │   └── types.ts                  TypeScript interfaces
│   │   ├── providers/          LLM, search, embeddings adapters
│   │   │   ├── llm/            Lovable, Ollama
│   │   │   ├── search/         Tavily, Brave, DuckDuckGo, Wikipedia
│   │   │   ├── reader/         Page fetching & extraction
│   │   │   └── embeddings/     Vector generation
│   │   ├── rag/                Document upload & vector search
│   │   ├── security/           Injection defense, sanitization
│   │   ├── tools/              Tool registry & implementations
│   │   └── config.ts           Environment-driven configuration
│   ├── components/
│   │   ├── research/           Chat view, source cards, markdown
│   │   └── ui/                 Radix UI primitives
│   ├── lib/
│   │   ├── research.functions.ts    Server RPC handlers
│   │   ├── owner-context.ts         Auth middleware
│   │   └── error-*.ts               Error handling
│   ├── routes/                 TanStack file-based routing
│   ├── server.ts               Cloudflare Workers entry
│   └── styles.css              Tailwind CSS
├── supabase/
│   ├── migrations/             Database schema
│   └── config.toml
├── .env.example                Environment variable template
├── ARCHITECTURE.md             Detailed design docs
├── package.json
└── tsconfig.json
```

---

## 🔒 Security

### Built-in Protections

✅ **Prompt Injection Defense**
- HTML sanitization on all web content
- Detects suspicious patterns (URLs, repeated keywords)
- Never passes raw content to LLM

✅ **Workspace Isolation**
- Every user has 1+ workspaces
- All data scoped to workspace
- Database enforces `workspace_id` checks

✅ **Permission System**
- Tools have required permissions
- Agent checks before execution
- Audit log every tool call

✅ **Input Validation**
- Zod schemas for all inputs
- Max lengths enforced
- Type-safe throughout

### Deployment Security

- **No secrets in code** — All env vars
- **Auth enforced** — Supabase JWT tokens
- **HTTPS only** — TLS in production
- **Audit trail** — Every action logged

---

## 🧪 Testing

```bash
# Run tests
npm test

# Lint
npm run lint

# Format
npm run format
```

**Test Coverage:**
- Query planning & intent analysis
- Citation verification
- Injection detection
- Permission checks
- Provider fallback behavior
- Database persistence

---

## 🌍 Deployment

### Local Development

```bash
npm run dev
```

### Production (Vercel)

```bash
npm run build
npm run preview    # Test build locally
vercel deploy
```

**Environment Setup:**
1. Create Supabase project (hosted or self-managed)
2. Run migrations: `supabase db push`
3. Set environment variables in Vercel/Netlify dashboard
4. Deploy frontend

### Self-Hosted

```bash
# With Docker
docker build -t keen-mind-bot .
docker run -e SUPABASE_URL=... keen-mind-bot

# With standalone server
npm run build
NODE_ENV=production node dist/server.js
```

---

## 📊 Monitoring & Observability

Every research run produces:
- **Run Record** — Question, mode, timing, token usage
- **Task Log** — Each step (search, read, compute)
- **Tool Calls** — Every invocation with args/results
- **Audit Trail** — Permission checks, injection detections
- **Self-Evaluation** — Gaps, contradictions, certainty levels

View via database or admin dashboard.

---

## 🤝 Contributing

### Adding a New LLM Provider

1. Create `src/core/providers/llm/yourprovider.server.ts`
2. Implement `LlmAdapter` interface
3. Register in `router.server.ts`
4. Add env var: `YOUR_PROVIDER_API_KEY`
5. Test with `npm test`

### Adding a New Search Provider

1. Create `src/core/providers/search/yourprovider.server.ts`
2. Implement `SearchAdapter` interface
3. Register in `registry.server.ts`
4. Tune authority scoring if needed

### Adding a Tool

1. Create tool under `src/core/tools/`
2. Implement `Tool` interface
3. Register in `implementations.server.ts`
4. Declare permissions

**Guidelines:**
- No hardcoded provider credentials
- All external dependencies configurable
- Assume external services can fail (add fallbacks)
- Log audit events for user actions
- Test provider switching

---

## 📚 Resources

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Deep dive into system design
- **[.env.example](.env.example)** — Configuration template
- **Database Schema** — See `supabase/migrations/`
- **Supabase Docs** — https://supabase.com/docs
- **TanStack Start** — https://tanstack.com/start

---

## ⚠️ Known Limitations

- **Browser Automation** — Scaffold ready, not yet fully implemented
- **n8n Integration** — Webhook scaffold ready
- **Scheduled Tasks** — Background job queue designed but not implemented
- **Multi-model Comparison** — Optional feature (can be enabled)

---

## 📝 License

MIT License — See [LICENSE](./MIT%20License) file.

**You are free to:**
- Use commercially
- Modify and fork
- Redistribute
- Use privately

**Under the condition:**
- Include license text in distributions

---

## 🙏 Acknowledgments

Built with:
- [TanStack Start](https://tanstack.com/start) — Full-stack React framework
- [Supabase](https://supabase.com/) — Open-source Firebase alternative
- [Radix UI](https://www.radix-ui.com/) — Accessible component primitives
- [Tailwind CSS](https://tailwindcss.com/) — Utility-first styling
- [Zod](https://zod.dev/) — TypeScript-first validation

---

## 🚀 Next Steps

1. **Clone & Configure** — Set up `.env` with your API keys
2. **Explore** — Try Quick Search, Deep Research, Knowledge modes
3. **Inspect Source** — Click `[n]` markers to verify evidence
4. **Customize** — Add your own search providers or tools
5. **Deploy** — Ship to production

**Questions?** Open an issue on GitHub or check [ARCHITECTURE.md](ARCHITECTURE.md).

---

**Happy researching!** 🔍📚
