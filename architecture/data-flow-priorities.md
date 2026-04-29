# Data Flow Build Priorities

Goal: one real user — a departing engineer doing a handoff — completing an end-to-end session as fast as possible.

---

## The Ruthless V1 Cut

Before the priority list, here's what gets cut entirely:

- **No vector store.** Claude's context window handles a small-to-medium codebase. Add pgvector only when you have users complaining about question quality.
- **No Jira/Confluence connectors.** The engineer can paste 3 paragraphs of context. Don't build a connector to save them 2 minutes of copy-paste.
- **No AST-level code parsing.** File paths and function names extracted by text matching are good enough for V1 code references.
- **No reviewer workflow.** The engineer can edit the markdown output manually.
- **No auth system.** One magic link per session, or no auth at all for a single-engineer prototype.
- **No output push.** Download a markdown file. The engineer can paste it into Confluence themselves.
- **No real-time transcript streaming to the server.** Buffer transcript locally in the prototype, push the full thing on session complete.

---

## Build Order

### Step 1 — Database schema (Day 1)

Stand up Supabase (or local Postgres). Run migrations for:

```
Engineer, Project, CodebaseSnapshot, CodeModule,
IngestedArtifact, InterviewSession, InterviewQuestion,
Transcript, TranscriptSegment,
ExtractedKnowledgeItem, CodeReference, OutputDocument
```

**Why first:** Every other step writes to or reads from the DB. Getting the schema right early avoids painful migrations when you're mid-integration.

**Skip:** `ArtifactReference`, `ProjectMember`, `vector` columns — add when needed.

---

### Step 2 — Transcript → knowledge extraction (Days 2-3)

Build the post-interview pipeline in isolation, using a fake transcript as input.

1. Write `KnowledgeExtractor.extract(segments[])` — Claude call, returns typed knowledge items
2. Write `CodeRefLinker.link(items[], codeModules[])` — string matching only, no embeddings
3. Write `OutputGenerator.generate(items[], refs[])` — Claude call, returns markdown string
4. Wire together as a single `POST /api/sessions/:id/process` endpoint

**Test it with a real transcript** (even manually typed) before moving on.

**Why second:** This is the core value proposition. If this output isn't good, nothing else matters. Validate the AI output quality before building ingestion or the interview UI integration.

---

### Step 3 — Manual ingestion (Days 3-4)

1. ZIP upload → unzip server-side → walk file tree → INSERT CodeModules (file path + symbol names via regex, not AST)
2. GitHub public repo URL → fetch `/git/trees` recursively → same CodeModule INSERT
3. Free-text paste for "additional context" (tickets, docs) → INSERT IngestedArtifact with `type=manual_paste`
4. Store everything flat in Postgres — no embeddings, no vector store

**Why third:** Ingestion feeds the question generator, which feeds the interview. You need real project data to test question quality.

---

### Step 4 — Question generation (Day 4)

1. `ContextBuilder.buildFlatContext(projectId)` — SELECT all CodeModules + IngestedArtifacts, serialize to text (file tree + commit summaries + paste context), truncate to ~80k tokens
2. `QuestionGenerator.generate(context, engineerRole, durationMinutes)` — single Claude call with a template prompt, returns JSON array of questions
3. `POST /api/sessions/:id/prepare` endpoint — runs steps 1-2, INSERTs InterviewQuestions

**Why fourth:** You now have questions grounded in real code. Before this step you were asking generic questions; after this step you're asking specific ones.

---

### Step 5 — Wire the voice prototype (Day 5)

1. Add `GET /api/sessions/:id/questions` — the prototype calls this on session start
2. Add `POST /api/sessions/:id/complete` — receives `SessionResult`, INSERTs Transcript + TranscriptSegments, then triggers `POST /sessions/:id/process` (Step 2)
3. In the prototype: replace hardcoded questions with the API call; add `onSessionComplete` → POST

**This is the moment the full loop closes.** You can now run an end-to-end session.

---

### Step 6 — Minimum frontend (Days 6-7)

Four screens only:

| Screen | What it does |
|--------|-------------|
| `/new` | Create project: name + repo URL or ZIP upload + optional context paste |
| `/projects/:id` | Show ingestion status, "Prepare Interview" button, list of sessions |
| `/sessions/:id/interview` | The interview UI (your prototype, embedded here) |
| `/sessions/:id/output` | Show extracted knowledge items + download button for markdown |

No dashboard, no settings, no user management.

---

### Step 7 — GitHub commits connector (Day 7-8, optional V1.5)

Fetches last 90 days of commits via the GitHub REST API (no auth, works for public repos). Adds meaningful historical context to question generation without requiring OAuth.

```
GET https://api.github.com/repos/{owner}/{repo}/commits?since=90d_ago&per_page=100
```

Slot commits in as `IngestedArtifact` rows with `type=commit`. The flat context dump in Step 4 improves significantly.

---

## What "Done" Looks Like for V1

A departing engineer can:

1. Create a project, upload their codebase ZIP or paste a GitHub URL
2. Paste a few paragraphs of ticket/doc context
3. Click "Prepare Interview" and get a question plan in < 2 minutes
4. Complete a 30-40 minute voice interview
5. Download a structured markdown handoff doc within 5 minutes of finishing

**That's the entire product.** Everything else is V2.

---

## V2 Unlock Order (after first real user)

Once someone has shipped a real handoff doc:

1. **pgvector + embeddings** — better question specificity, better code ref linking
2. **GitHub OAuth** — private repos, PR history, code review comments
3. **Knowledge item review UI** — let the engineer approve/edit before output generates
4. **Jira / Linear connector** — the single highest-value connector (tickets explain *why* code exists)
5. **Output push to Confluence / GitHub wiki** — eliminates the copy-paste step
6. **Multi-user / reviewer role** — the incoming engineer can annotate items with follow-up questions
