# Data Model — Entity Relationship Diagram

```mermaid
erDiagram
    Engineer {
        uuid id PK
        string name
        string email
        string current_role
        date departure_date
    }

    Project {
        uuid id PK
        string name
        string repo_url
        string description
        timestamp created_at
    }

    ProjectMember {
        uuid project_id FK
        uuid engineer_id FK
        string role
    }

    CodebaseSnapshot {
        uuid id PK
        uuid project_id FK
        string commit_sha
        string source_type
        timestamp taken_at
        string status
    }

    CodeModule {
        uuid id PK
        uuid snapshot_id FK
        string file_path
        string symbol_name
        string symbol_type
        int line_start
        int line_end
        text docstring
        vector embedding
    }

    IngestedArtifact {
        uuid id PK
        uuid project_id FK
        string artifact_type
        string external_id
        string source_system
        text raw_content
        text summary
        vector embedding
        timestamp ingested_at
    }

    InterviewSession {
        uuid id PK
        uuid project_id FK
        uuid engineer_id FK
        string status
        timestamp scheduled_at
        timestamp started_at
        timestamp completed_at
    }

    InterviewQuestion {
        uuid id PK
        uuid session_id FK
        uuid anchor_artifact_id FK
        int sequence
        text question_text
        string generated_by
        timestamp asked_at
        boolean skipped
    }

    Transcript {
        uuid id PK
        uuid session_id FK
        text raw_text
        json word_timestamps
        string stt_provider
        timestamp created_at
    }

    TranscriptSegment {
        uuid id PK
        uuid transcript_id FK
        uuid question_id FK
        string speaker
        int start_ms
        int end_ms
        text text
    }

    ExtractedKnowledgeItem {
        uuid id PK
        uuid session_id FK
        uuid source_segment_id FK
        string category
        string title
        text body
        float confidence
        string review_status
        timestamp extracted_at
    }

    CodeReference {
        uuid id PK
        uuid knowledge_item_id FK
        uuid module_id FK
        float relevance_score
        string match_reason
    }

    ArtifactReference {
        uuid id PK
        uuid knowledge_item_id FK
        uuid artifact_id FK
        float relevance_score
    }

    OutputDocument {
        uuid id PK
        uuid session_id FK
        string format
        string content_url
        string push_status
        timestamp generated_at
    }

    Engineer ||--o{ ProjectMember : "is member of"
    Project ||--o{ ProjectMember : "has"
    Project ||--o{ CodebaseSnapshot : "has"
    Project ||--o{ IngestedArtifact : "has"
    Project ||--o{ InterviewSession : "has"
    CodebaseSnapshot ||--o{ CodeModule : "contains"
    Engineer ||--o{ InterviewSession : "is subject of"
    InterviewSession ||--o{ InterviewQuestion : "contains"
    InterviewSession ||--|| Transcript : "produces"
    InterviewSession ||--o{ ExtractedKnowledgeItem : "yields"
    InterviewSession ||--o{ OutputDocument : "generates"
    Transcript ||--o{ TranscriptSegment : "contains"
    InterviewQuestion }o--o| IngestedArtifact : "anchored by"
    TranscriptSegment }o--o| InterviewQuestion : "answers"
    ExtractedKnowledgeItem }o--|| TranscriptSegment : "sourced from"
    ExtractedKnowledgeItem ||--o{ CodeReference : "linked to"
    ExtractedKnowledgeItem ||--o{ ArtifactReference : "cites"
    CodeReference }o--|| CodeModule : "points to"
    ArtifactReference }o--|| IngestedArtifact : "points to"
```

---

## Key Design Decisions

**`artifact_type` values on `IngestedArtifact`:** `commit`, `pull_request`, `ticket`, `doc_page`, `readme`, `manual_paste`

**`symbol_type` values on `CodeModule`:** `file`, `function`, `class`, `method`, `export`, `route`

**`category` values on `ExtractedKnowledgeItem`:**
- `decision` — an architectural or implementation choice and its rationale
- `gotcha` — something non-obvious that will bite the next engineer
- `risk` — known fragility, tech debt, or dependency concern
- `pattern` — a recurring pattern used in this codebase
- `context` — background that doesn't fit other categories

**`source_type` values on `CodebaseSnapshot`:** `zip_upload` (v1), `github_api` (v2), `git_clone` (v2)

**`review_status` on `ExtractedKnowledgeItem`:** `pending`, `accepted`, `rejected`, `edited` — supports the v2 reviewer workflow; default `accepted` in v1.

**Embeddings:** `CodeModule.embedding` and `IngestedArtifact.embedding` are stored as `vector(1536)` (pgvector) or omitted and stored in an external vector store in v1.
