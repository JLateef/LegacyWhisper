"""
Pass 1: Send ingested codebase artifacts to Claude and get back a ranked list
of interesting signals — specific spots worth asking the departing engineer about.
"""

import json
import re
import time
from dataclasses import dataclass
from pathlib import Path

import anthropic

from ingest.codebase import SourceFile
from ingest.commits import CommitEntry, get_churn_by_file
from ingest.tickets import Ticket

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

MAX_COMMITS_IN_PROMPT = 150
MAX_FILES_IN_PROMPT = 60
MAX_TOKENS_RESPONSE = 4096


@dataclass
class Signal:
    signal_type: str
    coordinates: str
    headline: str
    raw_evidence: str
    context: str
    interest_score: int


def extract_signals(
    files: list[SourceFile],
    commits: list[CommitEntry],
    tickets: list[Ticket],
    model: str = "claude-opus-4-7",
    verbose: bool = False,
) -> list[Signal]:
    """
    Pass 1: identify interesting spots in the codebase worth asking about.
    Returns signals sorted by interest_score descending.
    """
    system_prompt = (PROMPTS_DIR / "pass1_system.txt").read_text(encoding="utf-8")
    user_template = (PROMPTS_DIR / "pass1_user_template.txt").read_text(encoding="utf-8")

    commit_section = _build_commit_section(commits)
    ticket_section = _build_ticket_section(tickets)
    codebase_section = _build_codebase_section(files, commits)

    user_prompt = user_template.format(
        commit_section=commit_section,
        ticket_section=ticket_section,
        codebase_section=codebase_section,
    )

    if verbose:
        total_chars = len(system_prompt) + len(user_prompt)
        print(f"  [Pass 1] Prompt size: ~{total_chars // 4:,} tokens estimated")
        print(f"  [Pass 1] Inputs: {len(files)} files, {len(commits)} commits, {len(tickets)} tickets")

    start = time.time()
    raw_response = _call_claude(system_prompt, user_prompt, model, MAX_TOKENS_RESPONSE)
    elapsed = time.time() - start

    if verbose:
        print(f"  [Pass 1] Claude response received in {elapsed:.1f}s")

    signals = _parse_signals(raw_response)

    if verbose:
        print(f"  [Pass 1] Parsed {len(signals)} signals")

    return signals


def _build_commit_section(commits: list[CommitEntry]) -> str:
    if not commits:
        return "\n## COMMIT HISTORY\n[No commit history provided]\n"

    # Take the most interesting commits first (already sorted by interest_score)
    selected = commits[:MAX_COMMITS_IN_PROMPT]

    lines = ["\n## COMMIT HISTORY\n"]
    lines.append(f"(Showing {len(selected)} of {len(commits)} total commits, most interesting first)\n")

    for commit in selected:
        files_summary = ", ".join(
            f"{f.path} (+{f.additions}/-{f.deletions})"
            for f in commit.files_changed[:5]
        )
        if len(commit.files_changed) > 5:
            files_summary += f" ... and {len(commit.files_changed) - 5} more files"

        entry = f"""
commit {commit.short_hash}
Author: {commit.author} <{commit.author_email}>
Date:   {commit.date}
Message: "{commit.subject}"
"""
        if commit.body:
            entry += f"Body: {commit.body[:300]}\n"
        if files_summary:
            entry += f"Changed: {files_summary}\n"
        if commit.patch:
            entry += f"Diff (first 30 lines):\n{_truncate(commit.patch, 30)}\n"
        entry += "---"
        lines.append(entry)

    return "\n".join(lines)


def _build_ticket_section(tickets: list[Ticket]) -> str:
    if not tickets:
        return "\n## TICKET HISTORY\n[No ticket history provided]\n"

    lines = ["\n## TICKET HISTORY\n"]
    for ticket in tickets:
        reopen_flag = f" [REOPENED {ticket.reopen_count}x]" if ticket.reopen_count > 0 else ""
        entry = f"""
{ticket.id}{reopen_flag}: {ticket.title}
Description: {ticket.description[:400]}
Resolution: {ticket.resolution[:400]}"""
        if ticket.commit_refs:
            entry += f"\nLinked commits: {', '.join(ticket.commit_refs)}"
        entry += "\n---"
        lines.append(entry)

    return "\n".join(lines)


def _build_codebase_section(files: list[SourceFile], commits: list[CommitEntry]) -> str:
    if not files:
        return "\n## CODEBASE FILES\n[No codebase provided]\n"

    churn = get_churn_by_file(commits) if commits else {}

    # File tree first
    lines = ["\n## CODEBASE FILES\n"]
    lines.append("### File tree\n")
    for f in files:
        churn_note = f"  [{churn.get(f.path, 0)} lines changed across commits]" if commits else ""
        marker_note = f"  [markers: {', '.join(set(m.marker_type for m in f.markers))}]" if f.markers else ""
        lines.append(f"  {f.path} ({f.line_count} lines){churn_note}{marker_note}")

    # Then file contents — prioritize files with markers and high churn
    lines.append("\n### File contents\n")
    selected = _prioritize_files(files, churn)

    for f in selected[:MAX_FILES_IN_PROMPT]:
        truncated_note = " [TRUNCATED]" if f.truncated else ""
        lines.append(f"\n=== FILE: {f.path} ({f.line_count} lines, {f.language}){truncated_note} ===")
        lines.append(f.content)
        lines.append("")

    if len(files) > MAX_FILES_IN_PROMPT:
        omitted = len(files) - MAX_FILES_IN_PROMPT
        lines.append(f"[{omitted} additional files omitted to stay within context budget]")

    return "\n".join(lines)


def _prioritize_files(files: list[SourceFile], churn: dict[str, int]) -> list[SourceFile]:
    def sort_key(f: SourceFile) -> tuple:
        has_markers = 1 if f.markers else 0
        file_churn = churn.get(f.path, 0)
        return (-has_markers, -file_churn, f.path)

    return sorted(files, key=sort_key)


def _truncate(text: str, max_lines: int) -> str:
    lines = text.splitlines()
    if len(lines) <= max_lines:
        return text
    return "\n".join(lines[:max_lines]) + f"\n... [{len(lines) - max_lines} more lines]"


def _call_claude(system: str, user: str, model: str, max_tokens: int) -> str:
    client = anthropic.Anthropic()
    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return response.content[0].text


def _parse_signals(raw: str) -> list[Signal]:
    data = _extract_json(raw)
    if not isinstance(data, list):
        raise ValueError(f"Expected JSON array from Pass 1, got: {type(data)}")

    signals = []
    for item in data:
        if not isinstance(item, dict):
            continue
        try:
            signals.append(Signal(
                signal_type=str(item.get("signal_type", "unknown")),
                coordinates=str(item.get("coordinates", "")),
                headline=str(item.get("headline", "")),
                raw_evidence=str(item.get("raw_evidence", "")),
                context=str(item.get("context", "")),
                interest_score=int(item.get("interest_score", 5)),
            ))
        except (KeyError, TypeError, ValueError):
            continue

    signals.sort(key=lambda s: s.interest_score, reverse=True)
    return signals


def _extract_json(text: str) -> list | dict:
    text = text.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        text = re.sub(r"^```[a-z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find a JSON array within the text
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not parse JSON from Pass 1 response. First 300 chars: {text[:300]}")
