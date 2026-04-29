# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Legacy Whisperer captures institutional knowledge from engineers before they hand off a codebase. The core mechanic is a structured voice interview where an AI arrives prepared — having already ingested the codebase, commit history, and tickets — so it can ask specific, contextual questions instead of generic ones. Output is structured knowledge linked to code locations, formatted for the incoming engineer.

The project is being built phase by phase. The current state:
- **Frontend** (`src/`) — a working voice interview prototype (React + Vite)
- **Machine 1** (`machine1/`) — a standalone Python module that generates interview questions from a codebase
- **Architecture** (`architecture/`) — Mermaid diagrams and written specs for the full planned system

There is no backend yet. All frontend state is in-memory.

## Commands

### Frontend

```bash
npm run dev        # dev server at localhost:5173
npm run build      # production build
npm run preview    # preview production build locally
```

No test framework is configured.

### Machine 1 (Python — requires Python 3.11+)

```bash
cd machine1
pip install anthropic
export ANTHROPIC_API_KEY=your_key

# Run against the sample codebase (the primary way to evaluate question quality)
python test_harness.py --verbose --show-signals

# Run against a real codebase
git log --all --stat --format=fuller > git_log.txt
python generate_questions.py \
  --codebase ./path/to/code \
  --commits git_log.txt \
  --tickets tickets.csv \
  --output questions.json \
  --verbose
```

## Environment variables

The frontend proxies `/api/voice-token` to VocalBridge via `vite.config.js`:

```
VITE_VOCAL_BRIDGE_API_KEY=
VITE_VOCAL_BRIDGE_AGENT_ID=
```

Machine 1 reads `ANTHROPIC_API_KEY` directly from the environment.

## Frontend architecture

### State layer

`useInterview` (`src/hooks/useInterview.js`) is the central state machine. It owns the entire interview: phase/question progression, knowledge accumulation, connection extraction, and the `complete` transition. Every UI component is driven from values returned by this hook.

`useVoice` (`src/hooks/useVoice.js`) is the audio wrapper. It uses the Web Speech API for STT (browser-native, requires Chrome/Edge) and the Web Speech Synthesis API for TTS. It is wired to `useInterview` by passing `sendMessage` as the `onTranscript` callback. The two hooks are deliberately decoupled — `useInterview` knows nothing about audio.

**Critical stale-closure pattern:** Both hooks use refs that mirror state (`phaseIdxRef`, `questionIdxRef`, `connectedRef`, etc.) so that async callbacks always read current values without being re-created on every render. This pattern must be preserved when modifying either hook.

### Data layer

`src/data/questions.js` exports:
- `PHASES` — the hardcoded interview plan. Each phase has `questions[]`, each question has `text`, `knowledgeTag`, and `followUps[]` with trigger keywords.
- `KNOWLEDGE_TAG_LABELS` — maps `knowledgeTag` strings to human-readable section names for the Summary view.
- `ACKNOWLEDGMENTS` — randomized AI bridging phrases between questions.
- `PHASE_TRANSITIONS` — the transitional sentence spoken when moving between phases.

The `knowledgeBase` in `useInterview` is `{ [knowledgeTag]: string[] }` — it accumulates raw engineer responses grouped by the `knowledgeTag` of the question being answered. `generateSummary()` transforms this into `[{ label, tag, entries }]` for the Summary view.

### View routing

`App.jsx` switches between four full-page views via `activeView` state from `useInterview`:
- `interview` — three-column layout: PhaseNav / ChatInterface / ConnectionsPanel
- `connections` — full ConnectionsView with editing
- `documents` — DocumentsView (document tags and soft-delete are managed in App.jsx, not in the hook)
- `summary` — SummaryView, auto-activated when `phase === 'complete'`

### Known issue

`useVoice` submits transcript too early when the engineer pauses mid-sentence. The Web Speech API fires `isFinal` on natural pauses, not end-of-thought. Fix options: debounce with a confirm button, or switch to a streaming STT service.

## Machine 1 architecture

Two-pass Claude pipeline run entirely in Python:

**Pass 1 — Signal extraction** (`pipeline/signal_extractor.py`): Sends all ingested artifacts to Claude with a system prompt focused on identifying "interesting spots" — commits with cryptic messages, hardcoded values, reopened tickets, etc. Returns 20–35 ranked `Signal` objects.

**Pass 2 — Question generation** (`pipeline/question_generator.py`): Sends the signals (with surrounding context excerpts pulled from the original artifacts) to Claude with a system prompt demanding verbatim quotes and WHY-oriented questions. Returns up to 25 `Question` objects.

**Prompts are code.** All four prompt files live in `machine1/prompts/` as plain text. Design rationale is in the `*_design_notes.md` files alongside them. To iterate on question quality: edit the `.txt` files, run `python test_harness.py`, evaluate output. No code changes needed.

**The `Question` output schema** has two parallel reference fields: `code_reference` (human-readable string, e.g. `"payment_processor.py:47"`) and `anchor_metadata` (machine-readable dict with `type`, `id`, `file`, `line_start`, `line_end`) for the future code-linker pipeline.

## Integration contract between Machine 1 and the frontend

When the backend is built, `useInterview` needs these three changes:

1. `startInterview(info, questionPlan)` — accept a dynamic question plan from `GET /api/sessions/:id/questions` instead of reading from `PHASES`. Keep `PHASES` as the fallback.
2. `sendMessage` — fire-and-forget `POST /api/sessions/:id/segments` after each turn.
3. The `phase === 'complete'` transition — call `POST /api/sessions/:id/complete` with `{ messages, knowledgeBase, connections }`.

The `knowledgeBase` object already pre-organizes responses by `knowledgeTag`, which maps to the `category` field on `ExtractedKnowledgeItem` in the data model. The backend can seed knowledge items directly from it before running the Claude extraction pass.

## Architecture documentation

`architecture/` contains the full planned system design:
- `diagram-system-overview.md` — component map and data-flow-by-phase flowcharts
- `diagram-er.md` — full entity-relationship diagram with 13 entities
- `diagram-interview-pre.md` / `diagram-interview-live.md` — sequence diagrams for the full interview lifecycle
- `system-spec.md` — component responsibilities, both pipelines in detail, v1/v2 scope
- `data-flow-priorities.md` — opinionated build order for shipping one real user end-to-end
- `prototype-integration-notes.md` — maps the spec interface contracts to actual code in `useInterview.js`
