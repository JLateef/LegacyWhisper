"""
Pass 2: Takes the signals from Pass 1 and generates specific, anchored interview
questions. Each question quotes real artifacts and asks WHY, not WHAT.
"""

import json
import re
import time
from dataclasses import dataclass
from pathlib import Path

import anthropic

from ingest.codebase import SourceFile, get_file_excerpt
from ingest.commits import CommitEntry
from ingest.tickets import Ticket
from pipeline.signal_extractor import Signal

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

MAX_TOKENS_RESPONSE = 32000
VALID_REFERENCE_TYPES = {"file", "function", "commit", "ticket", "cross_cutting"}
VALID_PRIORITIES = {"high", "medium", "low"}


@dataclass
class Question:
    question_text: str
    code_reference: str
    reference_type: str
    reasoning: str
    priority: str
    anchor_metadata: dict


def generate_questions_from_signals(
    signals: list[Signal],
    files: list[SourceFile],
    commits: list[CommitEntry],
    tickets: list[Ticket],
    model: str = "claude-opus-4-7",
    max_questions: int = 25,
    verbose: bool = False,
) -> list[Question]:
    """
    Pass 2: generate interview questions from the signals identified in Pass 1.
    """
    if not signals:
        return []

    system_prompt = (PROMPTS_DIR / "pass2_system.txt").read_text(encoding="utf-8")
    user_template = (PROMPTS_DIR / "pass2_user_template.txt").read_text(encoding="utf-8")

    signals_json = json.dumps([_signal_to_dict(s) for s in signals], indent=2)
    context_excerpts = _build_context_excerpts(signals, files, commits, tickets)

    user_prompt = user_template.format(
        signals_json=signals_json,
        context_excerpts=context_excerpts,
    )

    if verbose:
        total_chars = len(system_prompt) + len(user_prompt)
        print(f"  [Pass 2] Prompt size: ~{total_chars // 4:,} tokens estimated")
        print(f"  [Pass 2] Processing {len(signals)} signals → target {max_questions} questions")

    start = time.time()
    raw_response = _call_claude(system_prompt, user_prompt, model, MAX_TOKENS_RESPONSE)
    elapsed = time.time() - start

    if verbose:
        print(f"  [Pass 2] Claude response received in {elapsed:.1f}s")

    questions = _parse_questions(raw_response, max_questions)

    if verbose:
        print(f"  [Pass 2] Parsed {len(questions)} questions")

    return questions


def _signal_to_dict(signal: Signal) -> dict:
    return {
        "signal_type": signal.signal_type,
        "coordinates": signal.coordinates,
        "headline": signal.headline,
        "raw_evidence": signal.raw_evidence,
        "context": signal.context,
        "interest_score": signal.interest_score,
    }


def _build_context_excerpts(
    signals: list[Signal],
    files: list[SourceFile],
    commits: list[CommitEntry],
    tickets: list[Ticket],
) -> str:
    """
    For each signal, pull the most relevant raw text from the ingested data.
    This gives Pass 2 the actual artifacts to quote from.
    """
    commit_index = {c.short_hash: c for c in commits}
    commit_index.update({c.hash[:7]: c for c in commits})
    ticket_index = {t.id: t for t in tickets}
    file_index = {f.path: f for f in files}

    sections = []
    for signal in signals:
        excerpt = _get_signal_excerpt(signal, file_index, commit_index, ticket_index)
        if excerpt:
            sections.append(f"### Signal: {signal.headline}\n{excerpt}")

    return "\n\n".join(sections) if sections else "[No supporting context available]"


def _get_signal_excerpt(
    signal: Signal,
    file_index: dict[str, SourceFile],
    commit_index: dict[str, CommitEntry],
    ticket_index: dict[str, Ticket],
) -> str:
    coords = signal.coordinates

    if coords.startswith("commit:"):
        short_hash = coords[7:14]
        commit = commit_index.get(short_hash)
        if commit:
            files_list = "\n".join(
                f"  {f.path} (+{f.additions}/-{f.deletions})" for f in commit.files_changed
            )
            excerpt = f'Message: "{commit.subject}"\nAuthor: {commit.author}\nDate: {commit.date}\nFiles changed:\n{files_list}'
            if commit.body:
                excerpt += f'\nBody: {commit.body}'
            if commit.patch:
                excerpt += f'\nDiff:\n{commit.patch[:1500]}'
            return excerpt

    elif coords.startswith("file:"):
        parts = coords[5:].split(":")
        file_path = parts[0]
        line = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else None
        source_file = file_index.get(file_path)
        if source_file and line:
            return get_file_excerpt(list(file_index.values()), file_path, line, window=15)
        elif source_file:
            return source_file.content[:2000]

    elif coords.startswith("ticket:"):
        ticket_id = coords[7:]
        ticket = ticket_index.get(ticket_id)
        if ticket:
            reopen = f"[Reopened {ticket.reopen_count} times]" if ticket.reopen_count else ""
            return f"ID: {ticket.id} {reopen}\nTitle: {ticket.title}\nDescription: {ticket.description}\nResolution: {ticket.resolution}"

    elif coords.startswith("function:"):
        # Try to find the function in file contents
        func_name = coords[9:].split(".")[-1]
        for source_file in file_index.values():
            if func_name in source_file.content:
                lines = source_file.content.splitlines()
                for i, line in enumerate(lines):
                    if f"def {func_name}" in line or f"function {func_name}" in line:
                        start = max(0, i - 2)
                        end = min(len(lines), i + 30)
                        return "\n".join(lines[start:end])

    return signal.raw_evidence  # fallback: use what was already quoted


def _call_claude(system: str, user: str, model: str, max_tokens: int) -> str:
    client = anthropic.Anthropic()
    with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    ) as stream:
        return stream.get_final_text()


def _parse_questions(raw: str, max_questions: int) -> list[Question]:
    data = _extract_json(raw)
    if not isinstance(data, list):
        raise ValueError(f"Expected JSON array from Pass 2, got: {type(data)}")

    questions = []
    for item in data:
        if not isinstance(item, dict):
            continue
        try:
            ref_type = str(item.get("reference_type", "file"))
            if ref_type not in VALID_REFERENCE_TYPES:
                ref_type = "file"

            priority = str(item.get("priority", "medium"))
            if priority not in VALID_PRIORITIES:
                priority = "medium"

            anchor = item.get("anchor_metadata", {})
            if not isinstance(anchor, dict):
                anchor = {}

            questions.append(Question(
                question_text=str(item.get("question_text", "")),
                code_reference=str(item.get("code_reference", "")),
                reference_type=ref_type,
                reasoning=str(item.get("reasoning", "")),
                priority=priority,
                anchor_metadata={
                    "type": anchor.get("type", ref_type),
                    "id": anchor.get("id", ""),
                    "file": anchor.get("file"),
                    "line_start": anchor.get("line_start"),
                    "line_end": anchor.get("line_end"),
                },
            ))
        except (KeyError, TypeError, ValueError):
            continue

    # Respect the max; model was already asked to filter, this is a safety cap
    return questions[:max_questions]


def _extract_json(text: str) -> list | dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not parse JSON from Pass 2 response. First 300 chars: {text[:300]}")
