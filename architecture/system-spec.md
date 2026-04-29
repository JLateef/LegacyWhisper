# Legacy Whisperer — System Specification

## Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Repo Connector** | Fetches commits, file tree, PRs, and blame data from GitHub/GitLab via API or ZIP upload |
| **Ticket Connector** | Pulls issues, epics, and labels from Jira or Linear using project keys |
| **Doc Connector** | Fetches pages and spaces from Confluence or Notion |
| **Codebase Analyzer** | Walks the file tree and parses source files into symbol-level CodeModules (functions, classes, routes) |
| **Artifact Indexer** | Normalizes raw ingested content, generates text summaries, and produces embeddings for vector search |
| **Context Builder** | For each high-signal module, retrieves semantically related artifacts from the vector store to build a dense context packet |
| **Question Generator** | Sends context packets to Claude and receives a session-specific, ordered interview plan anchored to real code and tickets |
| **Interview UI** | Drives the live voice conversation — plays AI audio, captures engineer speech, and persists transcript segments |
| **Turn Manager** | Manages the question sequence, decides whether to follow up or advance, and produces the AI's spoken turns |
| **Transcript Processor** | Diarizes raw transcript segments into clean AI/engineer turns keyed to specific questions |
| **Knowledge Extractor** | Sends engineer turns to Claude for classification into typed knowledge items (decisions, gotchas, risks, patterns, context) |
| **Code Ref Linker** | Maps each knowledge item to specific CodeModules and IngestedArtifacts via embedding similarity and exact-match heuristics |
| **Output Generator** | Sends the full knowledge item set to Claude for synthesis into a structured handoff document grouped by module |

---

## Pre-Interview Context Pipeline

The goal: turn a raw repository into a prompt that makes the AI ask "why did you put the rate limiter inside the middleware instead of at the gateway?" rather than "how does authentication work?"

### Steps

**1. Ingest raw sources**
- Repo Connector fetches the full file tree and the last 90 days of commits + PRs
- Ticket Connector pulls all issues linked to recent PRs (or by project label)
- Doc Connector pulls the top-level space pages
- Everything stored as `IngestedArtifact` rows with `raw_content` and a text `summary`

**2. Analyze the codebase**
- Codebase Analyzer walks every non-`node_modules` file
- For each file: extracts top-level symbols (functions, classes, exports, route handlers)
- Stores as `CodeModule` rows linked to the `CodebaseSnapshot`
- Computes "signal score" per module: recent commit count × file churn × LOC × open ticket count

**3. Build context packets**
- Context Builder selects the top 20-30 high-signal modules
- For each module, runs `similarity_search(module.embedding)` against all artifacts
- Returns the 5 most related commits, 3 most related tickets, and 2 most related doc pages
- Produces a structured context packet: `{ module, recent_commits[], related_tickets[], related_docs[], co_changed_modules[] }`

**4. Generate question plan**
- Context packets are serialized and sent to Claude with a system prompt specifying:
  - Session duration target (40 min → ~20 substantive questions)
  - Required question types: at least 2 "why" questions per module, 1 "what could go wrong" per high-risk module
  - Output schema: `[{ sequence, question_text, anchor_artifact_id, expected_category, module_path }]`
- Claude returns an ordered plan; questions are stored as `InterviewQuestion` rows

---

## Post-Interview Extraction Pipeline

The goal: turn an unstructured 40-minute conversation into typed, linked knowledge items a new engineer can navigate by module.

### Steps

**1. Segment the transcript**
- Transcript Processor takes raw `TranscriptSegment` rows (AI and engineer turns)
- Filters to engineer turns only; drops turns < 30 words ("yeah", "exactly")
- Groups related turns by question: one question + its follow-up answers form one extraction unit

**2. Classify and extract**
- For each extraction unit, Knowledge Extractor sends to Claude:
  ```
  Question asked: "<question text>"
  Engineer response: "<combined turn text>"
  
  Does this contain a decision, gotcha, risk, pattern, or context worth preserving?
  If yes: return { category, title (max 10 words), body (1 paragraph), confidence (0-1) }
  If no: return null
  ```
- Items with `confidence < 0.5` are flagged for review, not auto-accepted
- Stored as `ExtractedKnowledgeItem` rows

**3. Link code references**
- Code Ref Linker embeds each knowledge item's `body` text
- Runs `similarity_search` against `CodeModule` embeddings (top-3 hits)
- Also runs against `IngestedArtifact` embeddings (top-3 hits: commits, tickets)
- Additionally: exact string matching against file paths and function names mentioned in the text
- Stores as `CodeReference` and `ArtifactReference` rows with `relevance_score`

**4. Synthesize output document**
- Output Generator groups knowledge items by their highest-scoring `CodeReference.file_path`
- Sends the grouped, linked items to Claude with output format instructions:
  - One section per module with a 2-sentence module summary
  - Knowledge items as callout blocks with type badges (⚠️ Gotcha, 🏗 Decision, etc.)
  - Inline code references as `file_path:line_start` links
  - Final section: "Risks and Open Questions"
- Output: a single markdown file downloadable from the UI

---

## V1 vs V2 Scope

### V1 — Ship This

| Area | V1 Approach |
|------|-------------|
| Codebase ingestion | ZIP upload or GitHub public repo URL (unauthenticated API) |
| Commit history | GitHub REST API, last 90 days, no auth required for public repos |
| Tickets | Manual paste into a text field (no Jira connector) |
| Docs | Manual paste or URL that the engineer provides |
| Vector store | Skip — use Claude's context window directly (works for codebases < ~50k tokens of symbols) |
| Question generation | Template set + Claude augmentation; context is a flat text dump, not a vector-retrieved packet |
| Interview engine | Your existing voice prototype — drop-in as-is |
| Knowledge extraction | Claude, one pass per transcript chunk (no vector store needed) |
| Code reference linking | Exact string matching on file/function names mentioned in transcript + Claude's guesses |
| Output | Single markdown file, download button |
| Auth | None — single link per session (or single-user login) |
| Database | Supabase (hosted Postgres) or SQLite for local dev |

### V2 — Add When You Have Real Users

| Area | V2 Upgrade |
|------|------------|
| GitHub integration | OAuth app, webhook on push, private repos |
| Jira / Linear | OAuth connector, auto-link tickets to PRs |
| Confluence / Notion | OAuth connector, page sync on schedule |
| Vector store | pgvector in Supabase or Pinecone; semantic context packets |
| Code analysis | Tree-sitter AST for line-level symbol extraction |
| Question generation | Full context pipeline with per-module context packets |
| Code ref linking | Embedding-based similarity, not just string matching |
| Reviewer workflow | Accept/reject/edit UI for knowledge items before output generation |
| Output push | GitHub wiki, Confluence page, or Notion doc |
| Multi-user | Reviewer role, notification emails, shared project workspace |

---

## Voice Prototype Integration

Your prototype lives inside the **Interview Engine** subgraph. The rest of the system interacts with it through three interface contracts:

### Inputs the prototype must accept

```typescript
// Called before session starts — loads the question plan
startSession(sessionId: string, questionPlan: InterviewQuestion[]): void

interface InterviewQuestion {
  id: string
  sequence: number
  questionText: string
  anchorContext?: string   // optional: 1-2 sentences of context for the AI turn manager
  expectedCategory?: string
}
```

### Outputs the prototype must emit

```typescript
// Fires in real-time as transcript segments are produced
onTranscriptSegment(segment: TranscriptSegment): void

interface TranscriptSegment {
  questionId: string
  speaker: 'ai' | 'engineer'
  text: string
  startMs: number
  endMs: number
}

// Fires when session ends (all questions answered or engineer ends early)
onSessionComplete(result: SessionResult): void

interface SessionResult {
  sessionId: string
  segments: TranscriptSegment[]
  durationMs: number
  questionsAnswered: number
}
```

### What the prototype currently does vs. what to wire up

| Current behavior | Required change |
|-----------------|-----------------|
| Reads questions from a hardcoded array | Read from `GET /api/sessions/:id/questions` |
| Plays audio and captures transcript locally | Call `onTranscriptSegment` for each completed turn |
| Has no end-of-session hook | Call `onSessionComplete` and `POST /api/sessions/:id/complete` with the full transcript |
| No follow-up question logic | Turn Manager can inject follow-ups as additional `InterviewQuestion` objects at runtime |

The prototype's STT and TTS integrations are already the right architecture — those don't need to change.
