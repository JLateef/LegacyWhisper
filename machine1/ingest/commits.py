"""
Parses output from:
    git log --all --stat --format=fuller

Optionally also handles:
    git log --all --stat --patch --format=fuller

Produces CommitEntry objects sorted most-interesting-first for prompt construction.
"""

import re
from dataclasses import dataclass, field

# Commit messages containing these words on large diffs are high-signal
_CRYPTIC_KEYWORDS = {
    "fix", "fixes", "fixed", "fixing",
    "hack", "temp", "temporary", "workaround", "wip",
    "revert", "reverts", "hotfix", "emergency", "urgent",
    "prod", "production", "oops", "whoops", "mistake",
    "thing", "stuff", "issue", "problem", "it",
}


@dataclass
class ChangedFile:
    path: str
    additions: int
    deletions: int


@dataclass
class CommitEntry:
    hash: str               # full 40-char hash
    short_hash: str         # 7-char
    author: str
    author_email: str
    date: str               # raw date string from git
    subject: str            # first line of message
    body: str               # remaining lines of message (may be empty)
    files_changed: list[ChangedFile] = field(default_factory=list)
    patch: str = ""         # raw diff content if --patch was used
    interest_score: int = 0


def ingest_commits(log_path: str) -> list[CommitEntry]:
    """
    Parse a git log file and return CommitEntry objects, most interesting first.
    Returns an empty list if the file cannot be parsed.
    """
    try:
        with open(log_path, encoding="utf-8", errors="replace") as f:
            raw = f.read()
    except OSError as e:
        raise FileNotFoundError(f"Cannot read commit log at {log_path}: {e}") from e

    commits = _parse_log(raw)
    for commit in commits:
        commit.interest_score = _score_commit(commit)

    commits.sort(key=lambda c: c.interest_score, reverse=True)
    return commits


def _parse_log(raw: str) -> list[CommitEntry]:
    blocks = re.split(r"\ncommit ", raw)
    commits = []
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        if not block.startswith("commit "):
            block = "commit " + block
        commit = _parse_block(block)
        if commit:
            commits.append(commit)
    return commits


def _parse_block(block: str) -> CommitEntry | None:
    lines = block.splitlines()
    if not lines:
        return None

    # First line: "commit <hash>"
    first = lines[0].strip()
    if not first.startswith("commit "):
        return None
    full_hash = first[7:].strip()
    if len(full_hash) < 7:
        return None
    short_hash = full_hash[:7]

    author = ""
    author_email = ""
    date = ""
    i = 1

    # Parse headers until blank line
    while i < len(lines) and lines[i].strip():
        line = lines[i]
        if line.startswith("Author:"):
            m = re.match(r"Author:\s+(.+?)\s+<(.+?)>", line)
            if m:
                author, author_email = m.group(1), m.group(2)
        elif line.startswith("AuthorDate:"):
            date = line[len("AuthorDate:"):].strip()
        i += 1

    # Skip blank line(s)
    while i < len(lines) and not lines[i].strip():
        i += 1

    # Collect message lines (indented)
    message_lines = []
    while i < len(lines) and (lines[i].startswith("    ") or lines[i].startswith("\t")):
        message_lines.append(lines[i].strip())
        i += 1

    subject = message_lines[0] if message_lines else ""
    body = "\n".join(message_lines[1:]).strip() if len(message_lines) > 1 else ""

    # Skip blank lines between message and stats
    while i < len(lines) and not lines[i].strip():
        i += 1

    # Parse file stat lines: " path/to/file.py | 23 +++----"
    files_changed = []
    patch_lines = []
    while i < len(lines):
        line = lines[i]
        stat_match = re.match(r"^\s+(.+?)\s+\|\s+(\d+)\s+([+\-]*)", line)
        if stat_match:
            path = stat_match.group(1).strip()
            count = int(stat_match.group(2))
            plusminus = stat_match.group(3)
            additions = plusminus.count("+")
            deletions = plusminus.count("-")
            # If the +++--- count doesn't add up to total, distribute proportionally
            if additions + deletions == 0 and count > 0:
                additions = count // 2
                deletions = count - additions
            files_changed.append(ChangedFile(path=path, additions=additions, deletions=deletions))
        elif line.startswith("diff --git") or line.startswith("index ") or line.startswith("+++") or line.startswith("---") or line.startswith("@@") or line.startswith("+") or line.startswith("-"):
            patch_lines.append(line)
        i += 1

    return CommitEntry(
        hash=full_hash,
        short_hash=short_hash,
        author=author,
        author_email=author_email,
        date=date,
        subject=subject,
        body=body,
        files_changed=files_changed,
        patch="\n".join(patch_lines[:200]) if patch_lines else "",
    )


def _score_commit(commit: CommitEntry) -> int:
    """Heuristic interest score — higher means more worth asking about."""
    score = 0
    subject_lower = commit.subject.lower().strip()
    subject_words = subject_lower.split()

    total_lines = sum(f.additions + f.deletions for f in commit.files_changed)

    # Short message on a substantial change
    if len(subject_words) <= 3 and total_lines > 20:
        score += 4
    elif len(subject_words) <= 5 and total_lines > 50:
        score += 3

    # Cryptic keywords
    if any(kw in subject_words for kw in _CRYPTIC_KEYWORDS):
        score += 3

    # Large diff
    if total_lines > 200:
        score += 2
    elif total_lines > 50:
        score += 1

    # Many files touched
    if len(commit.files_changed) > 5:
        score += 1

    # Revert
    if "revert" in subject_lower:
        score += 2

    # Has body with keywords suggesting urgency
    body_lower = commit.body.lower()
    if any(kw in body_lower for kw in ["urgent", "emergency", "production", "incident", "hotfix"]):
        score += 2

    return score


def get_churn_by_file(commits: list[CommitEntry]) -> dict[str, int]:
    """Return total lines changed per file path, across all commits."""
    churn: dict[str, int] = {}
    for commit in commits:
        for f in commit.files_changed:
            churn[f.path] = churn.get(f.path, 0) + f.additions + f.deletions
    return dict(sorted(churn.items(), key=lambda x: x[1], reverse=True))


def get_author_churn(commits: list[CommitEntry]) -> dict[str, dict[str, int]]:
    """Return per-file commit counts per author."""
    result: dict[str, dict[str, int]] = {}
    for commit in commits:
        for f in commit.files_changed:
            if f.path not in result:
                result[f.path] = {}
            result[f.path][commit.author] = result[f.path].get(commit.author, 0) + 1
    return result
