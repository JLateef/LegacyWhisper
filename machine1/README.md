# Machine 1 — Question Generator

Reads a codebase, commit history, and ticket history. Produces a ranked list of
specific, contextual interview questions anchored to real code, commits, and tickets.

## Requirements

```bash
pip install anthropic
export ANTHROPIC_API_KEY=your_key_here
```

Python 3.11+ required (uses `dataclass` with `list[T]` type hints).

## Quick start

Run against the included sample codebase to verify it works:

```bash
cd machine1
python test_harness.py --verbose
```

Run against your own codebase:

```bash
# Generate git log (do this in your repo):
git log --all --stat --format=fuller > git_log.txt

# For richer signal extraction, include diffs for all commits:
git log --all --stat --patch --format=fuller > git_log_with_diffs.txt

# Run Machine 1:
python generate_questions.py \
  --codebase ./path/to/your/code \
  --commits git_log.txt \
  --tickets tickets.csv \
  --output questions.json \
  --verbose
```

## Input formats

### Codebase (`--codebase`)
A directory of source files. Machine 1 walks it recursively and skips common
non-source directories (`node_modules`, `.git`, `__pycache__`, etc.).

### Commit log (`--commits`)
Output of `git log --all --stat --format=fuller`. The `--stat` flag includes
file-level change stats. Adding `--patch` includes actual diffs, which gives
significantly better signal for cryptic commits but makes the log much larger.

**Recommendation:** For v1, use `--stat` only for the full history. If you know
which commits are most suspicious (e.g., the last 30), run `--patch` on those:

```bash
git log --all --stat --format=fuller > git_log.txt
git log --since="90 days ago" --patch --format=fuller >> git_log_with_diffs.txt
```

### Tickets (`--tickets`)
A CSV file with these columns (order flexible, matched by header name):

| Column | Required | Description |
|--------|----------|-------------|
| `id` | yes | Ticket identifier (e.g., `PROJ-234`) |
| `title` | yes | Short title |
| `description` | no | Full description |
| `resolution` | no | How it was resolved |
| `reopen_count` | no | How many times the ticket was reopened |
| `commit_refs` | no | Comma-separated commit hashes linked to this ticket |

## Output format

A JSON array of question objects:

```json
[
  {
    "question_text": "Commit a3f9bc2 from January 8th has the message 'fix' and changed 23 lines of payment_processor.py — what problem were you actually solving?",
    "code_reference": "commit:a3f9bc2",
    "reference_type": "commit",
    "reasoning": "Short message on a payment-critical change suggests this was rushed; the reasoning and any side effects are only in the author's head.",
    "priority": "high",
    "anchor_metadata": {
      "type": "commit",
      "id": "a3f9bc2",
      "file": "payment_processor.py",
      "line_start": null,
      "line_end": null
    }
  }
]
```

**`reference_type`** values: `file` | `function` | `commit` | `ticket` | `cross_cutting`

**`priority`** values:
- `high` — answer would prevent a future production incident, data loss, or failed migration
- `medium` — useful context for the new engineer's first 90 days
- `low` — interesting history, not operationally critical

**`anchor_metadata`** — machine-readable coordinates for the backend's code linker.
The `code_reference` field is the human-readable version of the same data.

## How it works

Machine 1 uses a **two-pass pipeline**:

**Pass 1 — Signal extraction**
Sends all ingested data to Claude with a system prompt focused on identifying
"interesting spots" — places where the why cannot be recovered from reading the
code alone. Returns 20–35 ranked signals with coordinates and raw evidence.

**Pass 2 — Question generation**
Sends the signals (with supporting context excerpts) to Claude with a system
prompt focused on generating specific, verbatim-quoting, why-oriented questions.
Applies self-critique filters before returning the final 15–25 questions.

The signal list from Pass 1 is saved separately (`--save-signals`) and is worth
reviewing before the interview — the departing engineer can curate it.

## Running the test harness

```bash
# Basic run
python test_harness.py

# See the Pass 1 signals before questions
python test_harness.py --show-signals

# Save output for comparison across iterations
python test_harness.py --show-signals --save-output ./results/

# Use a faster/cheaper model during prompt iteration
python test_harness.py --model claude-sonnet-4-6
```

The test harness runs against `sample_codebase/`, which contains three Python
files with intentional weirdness (hardcoded values, DO NOT TOUCH comments,
suspicious commit history, reopened tickets) designed to exercise all signal types.

**The bar:** run the harness and ask yourself whether the questions would make a
real engineer think "good question, let me explain." If they produce generic
questions, the prompt needs iteration — see `prompts/pass1_design_notes.md` and
`prompts/pass2_design_notes.md` for what to adjust.

## Prompt iteration

Prompts are in `prompts/` as plain text files — version them, iterate on them,
and document changes in the `*_design_notes.md` files.

To change a prompt: edit the `.txt` file, run `python test_harness.py`, evaluate
output quality. No code changes needed.

## Architecture notes

### Why two-pass instead of one
Signal extraction ("find the weird stuff") and question generation ("ask the right
question about it") are different tasks. Separating them produces better output
and creates a reviewable intermediate artifact.

### Why not one call per signal
Batching all signals in Pass 2 reduces API calls from 20–35 to 1, cuts latency
by ~60 seconds, and lets Claude naturally de-duplicate across signals. Per-signal
calls would give tighter context per question but the tradeoff isn't worth it for v1.

### Why `--patch` matters
`git log --stat` shows which files changed. The actual diff shows what changed.
A cryptic commit message on payment code is interesting; the actual 7-line diff
showing a hardcoded sleep being added is the specific question. Add `--patch`
for the best signal quality.

### Model recommendation
Both passes default to `claude-opus-4-7`. For prompt iteration (many test runs),
use `claude-sonnet-4-6` to reduce cost. Switch back to Opus for the real interview
preparation — question quality matters more than cost at that point.
