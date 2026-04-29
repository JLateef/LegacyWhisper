#!/usr/bin/env python3
"""
Test harness for Machine 1.

Runs the question generator against the sample codebase and prints results
in a human-readable format for evaluating question quality.

Usage:
    python test_harness.py
    python test_harness.py --verbose
    python test_harness.py --show-signals
    python test_harness.py --save-output results/
"""

import argparse
import json
import sys
import time
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

# Add machine1 root to path so this can be run from anywhere
sys.path.insert(0, str(Path(__file__).parent))

from generate_questions import generate_questions

SAMPLE_DIR = Path(__file__).parent / "sample_codebase"

PRIORITY_ICONS = {"high": "⚡", "medium": "◆", "low": "○"}
REF_TYPE_ICONS = {"commit": "[commit]", "file": "[file]", "function": "[func]",
                  "ticket": "[ticket]", "cross_cutting": "[cross]"}
PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def run_test(
    show_signals: bool = False,
    verbose: bool = False,
    save_dir: str | None = None,
    model: str = "claude-opus-4-7",
):
    codebase_path = str(SAMPLE_DIR)
    commit_log_path = str(SAMPLE_DIR / "commit_log.txt")
    tickets_path = str(SAMPLE_DIR / "tickets.csv")

    # Check sample files exist
    missing = []
    for p in [SAMPLE_DIR, SAMPLE_DIR / "commit_log.txt", SAMPLE_DIR / "tickets.csv"]:
        if not p.exists():
            missing.append(str(p))
    if missing:
        print(f"Error: missing sample files: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    print("=" * 70)
    print("  MACHINE 1 — QUESTION GENERATOR TEST HARNESS")
    print("=" * 70)
    print(f"  Codebase:  {codebase_path}")
    print(f"  Commits:   {commit_log_path}")
    print(f"  Tickets:   {tickets_path}")
    print(f"  Model:     {model}")
    print()

    start = time.time()

    questions, signals = generate_questions(
        codebase_path=codebase_path,
        commit_log_path=commit_log_path,
        tickets_path=tickets_path,
        model=model,
        max_questions=25,
        verbose=verbose,
    )

    elapsed = time.time() - start

    # Print signals if requested
    if show_signals:
        print()
        print("=" * 70)
        print(f"  PASS 1 OUTPUT — {len(signals)} SIGNALS IDENTIFIED")
        print("=" * 70)
        for i, signal in enumerate(signals, 1):
            score_bar = "█" * signal.interest_score + "░" * (10 - signal.interest_score)
            print(f"\n  {i:02d}. [{signal.signal_type}] score: {signal.interest_score}/10  {score_bar}")
            print(f"      {signal.headline}")
            print(f"      @ {signal.coordinates}")
            evidence_preview = signal.raw_evidence[:120].replace("\n", " ")
            if len(signal.raw_evidence) > 120:
                evidence_preview += "..."
            print(f"      Evidence: {evidence_preview}")
            print(f"      Context:  {signal.context}")

    # Print questions grouped by priority
    print()
    print("=" * 70)
    print(f"  PASS 2 OUTPUT — {len(questions)} QUESTIONS GENERATED")
    print(f"  Duration: {elapsed:.1f}s")
    print("=" * 70)

    for priority in ["high", "medium", "low"]:
        group = [q for q in questions if q.priority == priority]
        if not group:
            continue

        icon = PRIORITY_ICONS[priority]
        print(f"\n  {'─' * 60}")
        print(f"  {icon} {priority.upper()} PRIORITY — {len(group)} question{'s' if len(group) != 1 else ''}")
        print(f"  {'─' * 60}")

        for i, q in enumerate(group, 1):
            ref_icon = REF_TYPE_ICONS.get(q.reference_type, "[?]")
            print(f"\n  Q{i} {ref_icon}")
            # Word-wrap the question text at 65 chars
            words = q.question_text.split()
            line = "    "
            for word in words:
                if len(line) + len(word) + 1 > 68:
                    print(line)
                    line = "    " + word
                else:
                    line = line + (" " if line != "    " else "") + word
            if line.strip():
                print(line)
            print(f"\n    → {q.code_reference}")
            print(f"    Why it matters: {q.reasoning}")

    # Summary stats
    high_count = sum(1 for q in questions if q.priority == "high")
    med_count = sum(1 for q in questions if q.priority == "medium")
    low_count = sum(1 for q in questions if q.priority == "low")
    ref_types = {}
    for q in questions:
        ref_types[q.reference_type] = ref_types.get(q.reference_type, 0) + 1

    print()
    print("=" * 70)
    print("  SUMMARY")
    print("=" * 70)
    print(f"  Total questions: {len(questions)}")
    print(f"  By priority:     ⚡ {high_count} high   ◆ {med_count} medium   ○ {low_count} low")
    print(f"  By type:         {', '.join(f'{v} {k}' for k, v in sorted(ref_types.items()))}")
    print(f"  Signals used:    {len(signals)}")
    print(f"  Total time:      {elapsed:.1f}s")
    print()

    # Save output if requested
    if save_dir:
        out_dir = Path(save_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        questions_file = out_dir / f"questions_{timestamp}.json"
        signals_file = out_dir / f"signals_{timestamp}.json"

        questions_file.write_text(
            json.dumps([asdict(q) for q in questions], indent=2), encoding="utf-8"
        )
        signals_file.write_text(
            json.dumps([asdict(s) for s in signals], indent=2), encoding="utf-8"
        )
        print(f"  Output saved:")
        print(f"    Questions: {questions_file}")
        print(f"    Signals:   {signals_file}")
        print()

    return questions, signals


def main():
    parser = argparse.ArgumentParser(
        description="Test Machine 1 against the sample codebase"
    )
    parser.add_argument("--show-signals", action="store_true",
                        help="Print the Pass 1 signal list before questions")
    parser.add_argument("--verbose", action="store_true",
                        help="Show pipeline progress and token estimates")
    parser.add_argument("--save-output", default=None, metavar="DIR",
                        help="Save questions and signals JSON to this directory")
    parser.add_argument("--model", default="claude-opus-4-7",
                        help="Claude model to use (default: claude-opus-4-7)")

    args = parser.parse_args()

    run_test(
        show_signals=args.show_signals,
        verbose=args.verbose,
        save_dir=args.save_output,
        model=args.model,
    )


if __name__ == "__main__":
    main()
