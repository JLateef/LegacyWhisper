# Pass 1 Design Notes — Signal Extraction

## Why a separate pass at all

A single prompt that reads the codebase and generates questions simultaneously produces worse results than two focused passes. Signal extraction ("find the weird stuff") and question generation ("ask the right question about this weird thing") are different cognitive tasks. Separating them lets each pass specialize, and produces an intermediate signal list that is itself useful — the departing engineer can review and curate it before the interview runs.

## Why this signal taxonomy

The 10 signal types were chosen to cover every class of "hidden why" we've seen in real codebases:

| Signal type | What it catches |
|-------------|-----------------|
| `cryptic_commit` | Rushed decisions made under pressure — highest signal |
| `high_churn` | Accumulated tacit knowledge from repeated fixups |
| `hardcoded_value` | Learned constraints from external systems, incidents, or compliance |
| `workaround_comment` | Explicit acknowledgement of technical debt with unknown expiry |
| `error_swallowing` | Known failure modes being silently accepted |
| `retry_magic` | Specific numbers that encode real-world constraints |
| `reopened_ticket` | Problems that were harder than expected |
| `resolution_mismatch` | The stated fix wasn't the real fix |
| `dead_code` | Planned future work or cautiously preserved rollback paths |
| `cross_cutting` | Multiple signals pointing at the same location — highest priority |

## Why commits are weighted highest

A commit is a decision moment. It captures what changed, when, and the author's stated reason. A short commit message on a large change is almost always a story worth asking about — the author either didn't have time to explain or didn't think they needed to. Either way, the knowledge is likely only in their head.

Ticket and code signals are important but secondary because they are more likely to be self-explanatory: tickets have descriptions, code has comments. Commits often have neither.

## The interest_score scale

| Score | Meaning |
|-------|---------|
| 9–10 | Could cause a production incident or failed migration if not understood |
| 7–8 | Will make the new engineer make a wrong decision at some point |
| 5–6 | Useful context, not operationally critical |
| 3–4 | Interesting history, likely survives discovery independently |
| 1–2 | Borderline — include only if low-signal session needs padding |

## Context window budget

The Pass 1 user prompt is built to stay under 100K tokens (well within Claude's limit):
- Commits: up to 150 most recent, pre-sorted by `commit_interest_score` heuristic so the most suspicious ones appear first
- Tickets: all (usually < 50)
- File contents: up to 300 lines per file for small files; truncated for larger files with interesting markers prioritized

## What to iterate on

The most common failure mode is generating too many low-signal signals (flagging obvious TODOs, well-documented behavior). If this happens:
- Tighten the "NOT interested in" section of the system prompt
- Raise the floor on interest_score (instruct the model to only return signals ≥ 5)
- Add examples of signals that should NOT be flagged

The second failure mode is missing cross-cutting signals (a ticket + commit + hardcoded value all pointing at the same problem). If this happens:
- Add explicit instruction to look for co-occurrence across input types
- Consider a third pass specifically for cross-reference detection
