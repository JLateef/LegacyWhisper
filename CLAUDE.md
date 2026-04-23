# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# React frontend
npm run dev       # http://localhost:5173
npm run build
npm run preview

# FastAPI backend (first run: pip install -r backend/requirements.txt)
cd backend && uvicorn main:app --reload --port 8000

# Streamlit knowledge explorer (first run: pip install -r cognee_explorer/requirements.txt)
cd cognee_explorer && streamlit run app.py   # http://localhost:8501
```

No test runner or linter is configured. Python 3.9–3.12 required for Cognee.

## Environment

**React (root `.env`):** Copy `.env.example` → `.env`. `VITE_` vars are exposed to the browser by Vite. `VITE_BACKEND_URL` defaults to `http://localhost:8000` if absent.

**Backend (`backend/.env`):** Copy `backend/.env.example` → `backend/.env` and set `LLM_API_KEY`. Supports OpenAI (default), Anthropic, or Ollama — change `LLM_PROVIDER` / `EMBEDDING_PROVIDER` accordingly.

## Architecture

The project has three services:

| Service | Dir | Port | Purpose |
|---|---|---|---|
| React SPA | `src/` | 5173 | Interview UI + document upload |
| FastAPI + Cognee | `backend/` | 8000 | File storage, knowledge graph |
| Streamlit explorer | `cognee_explorer/` | 8501 | Query tester for the graph |

### Backend (`backend/`)

- `main.py` — FastAPI app; configures Cognee from env on startup via `lifespan`; CORS allows ports 5173 and 8501
- `routers/documents.py` — `POST /api/documents/upload` (saves files, returns IDs), `POST /api/documents/ingest` (calls `cognee.add()` + `cognee.cognify()`), `GET /api/documents`, `DELETE /api/documents/{id}`
- `routers/query.py` — `POST /api/query` (calls `cognee.search()`), `GET /api/datasets`
- Uploaded files are saved under `backend/uploads/` with UUID-prefixed names. Document registry is in-memory (resets on restart).
- Ingest is synchronous — the React frontend waits for the full response. Large batches may take minutes.

### Streamlit Explorer (`cognee_explorer/app.py`)

Lightweight query UI — calls the FastAPI layer only (no direct Cognee Python import). Sidebar controls backend URL, dataset name, `SearchType`, and top-k. Results shown as expandable cards.

### State machine: `src/hooks/useInterview.js`

All interview logic lives here. It manages:
- `phase`: `setup | interview | complete`
- `phaseIdx` / `questionIdx`: cursor through `PHASES[].questions[]`
- `knowledgeBase`: a `{ [knowledgeTag]: string[] }` map — each user reply is appended under the question's `knowledgeTag`
- `connections`: people extracted from user text (via regex in `extractPotentialPeople`) or added manually
- `suggestedPeople`: names detected but not yet accepted/dismissed
- `followUpAsked`: prevents double follow-up per question

The interview advances question-by-question on each `sendMessage` call. If a user reply matches a question's `followUps[].triggers` keywords, the follow-up is asked instead of advancing. After all phases are exhausted, `phase` becomes `complete` and the view switches to `summary`.

### Content: `src/data/questions.js`

Single source of truth for all interview content:
- `PHASES`: ordered array of interview phases, each with `id`, `name`, icon/color metadata, and `questions[]`
- Each question has `id`, `text`, `knowledgeTag`, and optional `followUps[]` (with `triggers` keyword array and follow-up `text`)
- `KNOWLEDGE_TAG_LABELS`: human-readable labels for each tag key
- `ACKNOWLEDGMENTS`: random affirmations inserted between questions
- `PHASE_TRANSITIONS`: transition text shown when moving between phases

### Views (`src/App.jsx`)

Four named views toggled via `activeView` state:
- `interview`: `PhaseNav` (left) + `ChatInterface` (center) + `ConnectionsPanel` (right sidebar)
- `connections`: full-page `ConnectionsView`
- `documents`: full-page `DocumentsView`
- `summary`: full-page `SummaryView` with export-to-txt

### Styling

Tailwind CSS with Inter font. Color coding by phase: indigo (Opening), blue (People), emerald (Building), amber (Tribal), rose (In Flight), purple (Legacy). These color keys are referenced directly in `SECTION_COLORS` in `SummaryView.jsx` and must stay in sync with the phase `color` field in `questions.js`.

### Document upload flow (`src/components/DocumentsView.jsx`)

Files are sent to `POST /api/documents/upload` as `multipart/form-data`. Each file immediately shows an `uploading → uploaded | failed` badge. Once ≥1 file is uploaded the "Build Knowledge Graph" button appears, which calls `POST /api/documents/ingest`. Pasted text ("Paste text directly") is local-only and never sent to the backend. The `Document` shape gained two optional fields: `backendId` and `uploadStatus`.

## Key design decisions

- **Person extraction** is regex-only (no AI): title-case pairs, Japanese honorifics (`-san/-kun`), and titles (`Mr./Ms./Dr.`). A stopword list in `extractPotentialPeople` filters common false positives.
- **Document deletion** is a soft-delete via local state in `App.jsx` (`deletedDocs` array) — documents are never removed from the `useInterview` hook's state.
- **Connection deduplication** is case-insensitive by name; adding a duplicate silently no-ops.
- The `Share Link` feature in `ConnectionsPanel` is a stub — it copies a non-functional URL and alerts the user.
