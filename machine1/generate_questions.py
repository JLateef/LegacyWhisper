#!/usr/bin/env python3
"""
Machine 1 — Question Generator for Legacy Whisperer

Reads a codebase, commit history, and ticket history, and produces a ranked
list of specific, contextual interview questions for an engineering handoff.

Usage:
    python generate_questions.py --codebase ./path/to/code
    python generate_questions.py --codebase ./code --commits ./git_log.txt --tickets ./tickets.csv
    python generate_questions.py --codebase ./code --commits ./git_log.txt --output questions.json
"""

import argparse
import json
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Optional

from ingest.codebase import ingest_codebase
from ingest.commits import ingest_commits
from ingest.tickets import ingest_tickets
from pipeline.signal_extractor import Signal, extract_signals
from pipeline.question_generator import Question, generate_questions_from_signals


def generate_questions(
    codebase_path: str,
    commit_log_path: Optional[str] = None,
    tickets_path: Optional[str] = None,
    model: str = "claude-opus-4-7",
    max_questions: int = 25,
    verbose: bool = False,
) -> tuple[list[Question], list[Signal]]:
    """
    Generate interview questions from a codebase and its history.

    Returns (questions, signals) where signals are the Pass 1 intermediate output.
    Both are useful: signals can be reviewed and curated before the interview.

    Quality tiers:
      - codebase only: generic structural questions, moderate quality
      - codebase + commits: substantially better, commit signals dominate
      - all three inputs: best quality, cross-cutting signals across all sources
    """
    start_total = time.time()

    if verbose:
        print(f"\nIngesting codebase: {codebase_path}")

    files = ingest_codebase(codebase_path)

    commits = []
    if commit_log_path:
        if verbose:
            print(f"Ingesting commits: {commit_log_path}")
        commits = ingest_commits(commit_log_path)

    tickets = []
    if tickets_path:
        if verbose:
            print(f"Ingesting tickets: {tickets_path}")
        tickets = ingest_tickets(tickets_path)

    if verbose:
        print(f"\nIngestion complete:")
        print(f"  {len(files)} source files")
        print(f"  {len(commits)} commits")
        print(f"  {len(tickets)} tickets")
        print(f"\nRunning Pass 1: signal extraction...")

    signals = extract_signals(files, commits, tickets, model=model, verbose=verbose)

    if verbose:
        print(f"\nRunning Pass 2: question generation...")

    questions = generate_questions_from_signals(
        signals, files, commits, tickets, model=model, max_questions=max_questions, verbose=verbose
    )

    elapsed = time.time() - start_total
    if verbose:
        print(f"\nDone in {elapsed:.1f}s — {len(questions)} questions from {len(signals)} signals")

    return questions, signals


def main():
    parser = argparse.ArgumentParser(
        description="Machine 1: Generate interview questions from a codebase",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Codebase only (lowest quality — use when you have nothing else)
  python generate_questions.py --codebase ./src

  # Codebase + commit history (recommended minimum)
  python generate_questions.py --codebase ./src --commits ./git_log.txt

  # All three inputs (best quality)
  python generate_questions.py --codebase ./src --commits ./git_log.txt --tickets ./tickets.csv

  # Save output and show intermediate signals
  python generate_questions.py --codebase ./src --commits ./git_log.txt \\
    --output questions.json --save-signals signals.json --verbose

Generate the git log with:
  git log --all --stat --format=fuller > git_log.txt

For richer signal extraction, include diffs for the most interesting commits:
  git log --all --stat --patch --format=fuller > git_log_with_diffs.txt
        """,
    )
    parser.add_argument("--codebase", required=True, help="Path to the source code directory")
    parser.add_argument("--commits", default=None, help="Path to git log file")
    parser.add_argument("--tickets", default=None, help="Path to tickets CSV file")
    parser.add_argument("--output", default=None, help="Save questions JSON to this path")
    parser.add_argument("--save-signals", default=None, help="Save Pass 1 signals JSON to this path")
    parser.add_argument("--model", default="claude-opus-4-7", help="Claude model to use")
    parser.add_argument("--max-questions", type=int, default=25, help="Maximum questions to generate")
    parser.add_argument("--verbose", action="store_true", help="Show pipeline progress")
    parser.add_argument("--quiet", action="store_true", help="Only output the JSON, nothing else")

    args = parser.parse_args()

    if not Path(args.codebase).is_dir():
        print(f"Error: --codebase path does not exist or is not a directory: {args.codebase}", file=sys.stderr)
        sys.exit(1)

    try:
        questions, signals = generate_questions(
            codebase_path=args.codebase,
            commit_log_path=args.commits,
            tickets_path=args.tickets,
            model=args.model,
            max_questions=args.max_questions,
            verbose=args.verbose and not args.quiet,
        )
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)

    questions_data = [asdict(q) for q in questions]
    signals_data = [asdict(s) for s in signals]

    if args.save_signals:
        Path(args.save_signals).write_text(json.dumps(signals_data, indent=2), encoding="utf-8")
        if not args.quiet:
            print(f"Signals saved to: {args.save_signals}")

    if args.output:
        Path(args.output).write_text(json.dumps(questions_data, indent=2), encoding="utf-8")
        if not args.quiet:
            print(f"Questions saved to: {args.output}")
    else:
        # Print to stdout
        print(json.dumps(questions_data, indent=2))


if __name__ == "__main__":
    main()
