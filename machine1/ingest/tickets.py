"""
Parses ticket history from a CSV file.

Expected columns (order flexible, matched by header name):
  id, title, description, resolution, reopen_count, commit_refs

All columns except `id` and `title` are optional.
"""

import csv
from dataclasses import dataclass, field


@dataclass
class Ticket:
    id: str
    title: str
    description: str = ""
    resolution: str = ""
    reopen_count: int = 0
    commit_refs: list[str] = field(default_factory=list)
    interest_score: int = 0


def ingest_tickets(tickets_path: str) -> list[Ticket]:
    """
    Parse a CSV ticket file and return Ticket objects, most interesting first.
    Returns an empty list if the file cannot be read.
    """
    try:
        with open(tickets_path, encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
    except OSError as e:
        raise FileNotFoundError(f"Cannot read tickets file at {tickets_path}: {e}") from e

    tickets = []
    for row in rows:
        ticket = _parse_row(row)
        if ticket:
            ticket.interest_score = _score_ticket(ticket)
            tickets.append(ticket)

    tickets.sort(key=lambda t: t.interest_score, reverse=True)
    return tickets


def _parse_row(row: dict) -> Ticket | None:
    # Normalize keys: lowercase, strip whitespace
    normalized = {k.lower().strip(): v.strip() for k, v in row.items() if v is not None}

    ticket_id = normalized.get("id", "").strip()
    title = normalized.get("title", "").strip()
    if not ticket_id:
        return None

    reopen_count = 0
    raw_reopen = normalized.get("reopen_count", "0").strip()
    try:
        reopen_count = int(raw_reopen)
    except ValueError:
        pass

    commit_refs = []
    raw_refs = normalized.get("commit_refs", "").strip()
    if raw_refs:
        commit_refs = [r.strip() for r in raw_refs.split(",") if r.strip()]

    return Ticket(
        id=ticket_id,
        title=title,
        description=normalized.get("description", ""),
        resolution=normalized.get("resolution", ""),
        reopen_count=reopen_count,
        commit_refs=commit_refs,
    )


def _score_ticket(ticket: Ticket) -> int:
    score = 0

    # Reopened tickets are the clearest signal of hidden complexity
    if ticket.reopen_count >= 3:
        score += 5
    elif ticket.reopen_count == 2:
        score += 3
    elif ticket.reopen_count == 1:
        score += 1

    # Urgency indicators in title or description
    urgency_keywords = ["p0", "p1", "sev1", "sev2", "hotfix", "incident", "postmortem",
                        "critical", "production down", "data loss", "security"]
    combined_text = (ticket.title + " " + ticket.description).lower()
    if any(kw in combined_text for kw in urgency_keywords):
        score += 2

    # Resolution doesn't obviously relate to the problem (rough heuristic)
    if ticket.resolution and ticket.description:
        desc_words = set(ticket.description.lower().split())
        res_words = set(ticket.resolution.lower().split())
        stop_words = {"the", "a", "an", "is", "was", "were", "in", "on", "to", "for", "of", "and"}
        desc_words -= stop_words
        res_words -= stop_words
        overlap = desc_words & res_words
        if len(desc_words) > 5 and len(overlap) / max(len(desc_words), 1) < 0.15:
            score += 2  # resolution mismatch

    # Referenced in commits
    if ticket.commit_refs:
        score += 1

    return score
