# Research Companion

Task: You are a senior AI-agent architect, full-stack engineer, research-system engineer, and security engineer. Your job is to transform my existing Sutradhar project into a complete Perplexity-style personal AI research agent, not just an MVP, demo, UI mockup, or API wrapper.

First inspect the entire existing project, including its frontend, backend, configuration, dependencies, routes, components, research flow, current Perplexity integration, history system, exports, and n8n hand-off. Reuse working code where appropriate instead of unnecessarily rebuilding everything.

Please repeat the prompt back as you understand it, then inspect the project and create an implementation plan. After that, implement the system phase by phase. Do not stop after creating a plan. Do not leave major features as fake/demo placeholders when they can be implemented locally. Run the application, test the implemented features, fix errors, and continue until the core agent is functional.

Specifics:

Build a real agent, not merely a chat interface.

The agent must understand the user's intent.

Break complex requests into smaller tasks.

Create a task plan before executing complex research.

Maintain agent state such as planning, searching, reading, reasoning, verifying, answering, acting, completed, and failed.

Support multi-step tasks and tool execution.

Allow the agent to retry, recover, or change strategy when a tool or source fails.

Make the architecture provider-independent.

Do not hard-code the entire system around Perplexity.

Create interfaces/adapters for LLM providers, search providers, embeddings, browser automation, storage, and external tools.

Support a local-model path such as Ollama/llama.cpp/LM Studio where practical.

External APIs must be optional adapters, not mandatory for the core architecture.

If live web search requires an external provider, clearly separate that provider from the agent itself.

Never pretend that a local LLM has fresh web knowledge when it does not.

Build the research engine.

Accept a normal user question.

Analyze the question.

Decide whether web research is necessary.

Generate one or more search queries for complex questions.

Search multiple sources when appropriate.

Retrieve relevant pages/content.

Extract useful passages rather than blindly sending entire pages to the model.

Remove duplicate or low-value sources.

Prefer authoritative and diverse sources.

Consider freshness when the question requires current information.

Re-search when the evidence is insufficient.

Synthesize the final answer from collected evidence.

Build a proper citation and evidence system.

Every web-grounded factual claim should be traceable to evidence whenever possible.

Store source URL, title, domain, publication date if available, author if available, retrieved time, relevant excerpt, and citation ID.

Render citations cleanly in the answer.

Clicking a citation should open the corresponding source or source preview.

Do not create fake citations.

Do not cite a source merely because it appeared in search results.

Add an internal claim → evidence → source relationship.

Detect unsupported claims before producing the final answer.

If reliable sources disagree, explicitly represent the disagreement instead of inventing certainty.

Build multiple research modes.

Quick Search: fast web-grounded answer.

Deep Research: multi-query, multi-source, iterative research.

File/Knowledge Research: answer from uploaded/private knowledge.

Local Research: use local models and local knowledge where possible.

Keep the architecture extensible for future specialized modes.

Do not claim to reproduce proprietary internal Perplexity algorithms. Reproduce the observable user-facing capabilities using a transparent architecture.

Build a model-routing layer.

Allow different models to be selected for different tasks.

Use lightweight models for simple classification/extraction when appropriate.

Use stronger models for difficult reasoning.

Support local models first where practical.

Keep model configuration outside the business logic.

Add fallback models/providers where possible.

Never make the application depend on one model provider.

Add an optional multi-model comparison system.

Allow a difficult query to be sent to multiple configured models.

Compare their answers.

Identify agreement and disagreement.

Have a final synthesis step.

Make this optional so normal queries do not waste resources.

Do not require paid APIs for the basic agent architecture.

Build a real tool system.
Create a registry and permission model for tools such as:

web search

web/page reader

browser automation

PDF/document reader

OCR

file parser

private knowledge search

calculator

code execution where safely sandboxed

SQL/database access

report generation

export

n8n workflows

email/connectors

future tools

Each tool must have:

name

description

input schema

output schema

permissions

timeout

retry policy

error handling

audit information

Add tool selection and execution.

The agent should decide which tool is appropriate.

Validate tool arguments before execution.

Never blindly execute arbitrary model-generated commands.

Validate outputs before passing them into later steps.

Record every tool call and result in the agent run history.

Support cancellation and failure recovery.

Build a secure browser-agent foundation for future use.

Use Playwright or an equivalent browser automation layer.

Support navigation, page reading, clicking, typing, screenshots, and structured extraction.

Treat webpage content as untrusted data.

Defend against prompt injection from webpages.

Maintain an allowed-domain/permission mechanism.

Require human approval before irreversible or sensitive actions such as purchases, deletion, account changes, sending messages, or final form submission.

Keep browser automation modular so it can be enabled later without redesigning the agent.

Build document intelligence.
Support:

PDF

DOC/DOCX

XLS/XLSX

CSV

TXT/Markdown

images/scanned documents through OCR where practical

Implement:

upload

validation

text extraction

metadata

chunking

embeddings

vector/semantic search

keyword/hybrid search where appropriate

document-level and page-level citations

deletion

re-indexing

private-per-user/per-workspace access control

Build a proper RAG system.

Separate ingestion from retrieval.

Store document metadata.

Retrieve only relevant context.

Prevent unrelated users/workspaces from accessing private documents.

Support source attribution.

Make the vector database replaceable.

Allow a local vector store for local-first operation.

Build working memory and long-term memory.
Working memory:

current task

current plan

current sources

current tool results

current reasoning context

Long-term memory:

user preferences

projects

important facts explicitly worth remembering

previous research

workspace knowledge

Do not store everything blindly. Add memory selection, privacy controls, deletion, and inspection.

Build Projects/Spaces.
Each workspace/project should be able to contain:

conversations

instructions

files

sources

memories

research reports

agent runs

future workflows

Build persistent storage.
Replace browser-only history with a proper database architecture.
Store at minimum:

users

workspaces

conversations

messages

agent runs

tasks

tool calls

sources

citations

files

memories

reports

jobs

audit events

Keep the database layer modular so SQL Server/PostgreSQL can be selected through configuration.

Preserve and improve the current Sutradhar functionality.
Do not remove working features such as:

Quick Search

Deep Research

source trail

follow-up questions

research history

Markdown/report export

current project UI

existing API integration

n8n hand-off

Improve them where necessary so they become part of the real agent architecture rather than isolated demo features.

Add streaming and real-time agent status.
The UI should show meaningful states such as:

Understanding request

Planning research

Searching

Reading sources

Comparing evidence

Verifying citations

Generating answer

Completed

Do not expose hidden chain-of-thought. Show only safe high-level progress/status.

Add self-evaluation.
Before finalizing an answer, evaluate:

Did the agent actually answer the user's request?

Is the information sufficiently supported?

Are citations attached to the appropriate claims?

Are sources relevant and sufficiently diverse?

Are there contradictions?

Is anything uncertain?

Should another search be performed?

If evidence is insufficient, continue researching or clearly state the limitation.

Add context management.

Prevent huge conversations from overflowing model context.

Summarize older context when appropriate.

Preserve important facts, instructions, sources, and task state.

Keep current task context separate from long-term memory.

Add scheduled/background capability as an extension point.
Design the architecture so future jobs can perform:

daily research

competitor monitoring

recurring reports

news monitoring

scheduled document processing

notifications

Do not make n8n mandatory for the core agent.

Add n8n as an optional integration layer.

Keep the current n8n hand-off.

Create a clean webhook/workflow adapter.

Support authenticated webhooks.

Send structured payloads.

Receive workflow status/results where practical.

Do not allow n8n integration to block the local core agent.

Advanced automation can be added later through this interface.

Build an external connector architecture.
Keep future connectors possible for services such as email, cloud storage, messaging, calendars, and business systems.
Each connector must have isolated permissions and credentials.
Never expose secrets to the frontend.

Add security from the beginning.
Implement:

authentication

authorization

workspace isolation

secure sessions/tokens

secret management

API-key protection

input validation

output validation

file validation

HTML sanitization

SQL injection protection

SSRF protection

webhook authentication

rate limiting

prompt-injection defenses

audit logging

safe browser permissions

Add observability.
For every agent run, track:

run ID

user/workspace

start/end time

current state

tools used

sources

errors

retries

model/provider

latency

token/cost information when available

final status

Provide a developer/admin view for diagnosing failures.

Add background jobs and queues.
Long-running Deep Research, file ingestion, scheduled tasks, and report generation should not depend on a single synchronous HTTP request.
Create a worker/queue abstraction that can initially run locally and later scale.

Add artifacts and exports.
The agent should be able to create and manage:

Markdown

PDF

CSV

Excel

structured JSON

research reports

Keep generated artifacts associated with the conversation/project and allow secure download.

Add graceful failure handling.
If a search provider fails, use another configured provider if available.
If a source fails, continue with other sources.
If a model fails, use a configured fallback.
If a tool times out, retry according to policy.
Never fabricate successful results.

Add provider configuration.
All providers, models, URLs, limits, and feature flags must be configurable.
No secrets or provider-specific settings should be hard-coded into frontend code.

Add local-first operation.
The application must have a meaningful local mode.
At minimum, design for:

local LLM

local embeddings

local database

local document RAG

local browser automation

local agent orchestration

Clearly distinguish local/offline capabilities from live-internet capabilities.
Do not falsely claim that offline mode can provide current web information.

Do not stop at an MVP.
Treat this as a complete product build.
If a feature cannot reasonably be completed in the current environment because an external credential/service is required, implement the complete abstraction, configuration, validation, error handling, and local alternative where possible, then clearly identify the external dependency.

Do not fake functionality.
Do not create buttons that only display “coming soon” when the underlying functionality can be implemented.
Do not use hard-coded fake search results.
Do not generate fake citations.
Do not claim a feature works unless it has been tested.

Work incrementally but continue through all phases.
Use this implementation order:
Phase 1 — inspect and stabilize existing project
Phase 2 — agent core and state machine
Phase 3 — search/research engine
Phase 4 — evidence and citation engine
Phase 5 — model/provider routing
Phase 6 — persistent database and memory
Phase 7 — file intelligence and RAG
Phase 8 — tool system
Phase 9 — security and permissions
Phase 10 — browser foundation
Phase 11 — n8n/connectors
Phase 12 — background jobs
Phase 13 — observability/admin
Phase 14 — production hardening
Phase 15 — full end-to-end testing

At the beginning of implementation, inspect the repository and produce:

current architecture

current working features

incomplete features

technical debt

security issues

files that should be reused

files that should be replaced

recommended implementation order

Then implement the work.
For every phase:

explain the goal briefly

make the required code changes

create missing files

update existing files

install only necessary dependencies

run tests/build/lint where available

fix errors

verify the feature

move to the next phase

Maintain clean architecture.
Separate:

UI

API

agent orchestration

model providers

search providers

tools

RAG

memory

database

browser automation

integrations

security

background workers

Make the final system extensible.
I should be able to add a new:

LLM

search provider

browser tool

connector

vector database

workflow provider

automation
without rewriting the entire application.

Testing is mandatory.
Create tests for:

query planning

tool selection

search failures

citation mapping

source conflicts

RAG retrieval

permissions

authentication

prompt injection defense

browser approval flow

memory isolation

API failure/fallback

end-to-end research

Final acceptance criteria:
The completed system should be able to receive a complex user request, determine what it needs, plan the task, search/read relevant information, use appropriate tools, collect and verify evidence, generate a useful cited answer, remember relevant context, use private documents when authorized, recover from failures, and safely execute approved actions.

It must work as a real agent rather than a static chatbot.

Important constraint:
Do not attempt to reproduce or claim knowledge of proprietary internal Perplexity implementation details. Recreate the user-facing capabilities and behavior using an independent, transparent architecture.

Most important instruction:
Do not stop after giving me architecture, explanations, pseudocode, or a TODO list. Inspect the existing project and actually implement as much of the system as the environment allows. When an external API, credential, browser, model, or service is genuinely required, isolate it behind a proper adapter and provide a working local/test implementation where possible.

At the end, provide:

what was already present

what you changed

what is now fully working

what requires an external service/key

how to run the complete system

how to test every major capability

remaining limitations, if any

the exact next command/action needed to continue

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://keen-mind-bot.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b771c686-0116-4f60-9592-2836ba49d422).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
