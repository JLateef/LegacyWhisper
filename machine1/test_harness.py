#!/usr/bin/env python3
"""
Test harness for Machine 1.

Runs the question generator against the sample codebase and produces a
browser-viewable HTML report showing question quality and signal coverage.

Usage:
    python test_harness.py                        # runs and opens report
    python test_harness.py --model claude-sonnet-4-6  # cheaper model for iteration
    python test_harness.py --verbose              # show pipeline progress
"""

import argparse
import json
import os
import sys
import time
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from generate_questions import generate_questions

SAMPLE_DIR = Path(__file__).parent / "sample_codebase"

# ── Signal manifest ────────────────────────────────────────────────────────────
# The 12 pieces of weirdness deliberately planted in sample_codebase/.
# A signal is "caught" if any of its keywords appear in a generated question
# (question_text + reasoning + code_reference, case-insensitive).

SIGNAL_MANIFEST = [
    {
        "id": "stripe_retry_delay",
        "description": "STRIPE_RETRY_DELAY = 7 — hardcoded value with 'DO NOT TOUCH' comment referencing March 2023 cascade",
        "keywords": ["stripe_retry_delay", "retry_delay", "7 second", "7-second", "do not touch", "cascade"],
        "source": "payment_processor.py:13",
        "priority": "high",
    },
    {
        "id": "batch_size_47",
        "description": "BATCH_SIZE = 47 — not arbitrary; chosen after August 2023 post-mortem to stay under undocumented rate limit",
        "keywords": ["batch_size", "batch size", "47", "batch of 47", "post-mortem", "postmortem"],
        "source": "data_pipeline.py:12",
        "priority": "high",
    },
    {
        "id": "sleep_2_1",
        "description": "time.sleep(2.1) — 2.1 not 2.0; the extra 100ms has a specific reason from the post-mortem",
        "keywords": ["2.1", "2.1s", "two point one", "sleep(2", "100ms", "100 ms"],
        "source": "data_pipeline.py:32",
        "priority": "high",
    },
    {
        "id": "exception_swallow",
        "description": "except Exception: pass — silently swallows errors in the payment critical path",
        "keywords": ["except exception", "except:", "swallow", "silent fail", "bare except", "garbage"],
        "source": "payment_processor.py:40",
        "priority": "high",
    },
    {
        "id": "fix_commit",
        "description": "Commit a3f9bc2 — message is just 'fix', touches 23 lines of payment code",
        "keywords": ["a3f9bc2", "\"fix\"", "'fix'", "message: fix", "message is fix", "one-word commit"],
        "source": "commit:a3f9bc2",
        "priority": "high",
    },
    {
        "id": "bank_thing_commit",
        "description": "Commit e7b0fa6 — message 'fix the bank thing'; vague, touches payment + pipeline, mentions Tuesdays",
        "keywords": ["e7b0fa6", "bank thing", "fix the bank", "tuesday", "tuesdays"],
        "source": "commit:e7b0fa6",
        "priority": "high",
    },
    {
        "id": "legacy_merchant_cutoff",
        "description": "LEGACY_MERCHANT_CUTOFF = 1609459200 — frozen epoch timestamp; migration cancelled due to KYC concerns",
        "keywords": ["legacy_merchant_cutoff", "1609459200", "epoch", "cutoff", "braintree", "kyc", "migration"],
        "source": "payment_processor.py:17",
        "priority": "high",
    },
    {
        "id": "square_revert",
        "description": "Square fallback removed (commit 9d2e3f4) then re-added the next day (commit f8c1ab7) after a Stripe outage",
        "keywords": ["9d2e3f4", "f8c1ab7", "revert", "square", "fallback", "removed then"],
        "source": "commit:f8c1ab7",
        "priority": "medium",
    },
    {
        "id": "pay_234_reopened",
        "description": "PAY-234 reopened 3 times — weekend payment failures; root cause was an undocumented Stripe rate limit",
        "keywords": ["pay-234", "pay 234", "weekend", "saturday", "sunday", "reopened 3"],
        "source": "ticket:PAY-234",
        "priority": "high",
    },
    {
        "id": "set_112_deadline",
        "description": "SET-112 reopened 2 times — settlement missed the 6 AM clearing deadline; 30-minute margin remaining",
        "keywords": ["set-112", "set 112", "settlement", "deadline", "clearing", "6 am", "6am"],
        "source": "ticket:SET-112",
        "priority": "high",
    },
    {
        "id": "sha256_tokens",
        "description": "Session tokens use sha256 (wrong) instead of bcrypt; can't migrate without breaking mobile clients",
        "keywords": ["sha256", "sha-256", "mobile", "session token", "bcrypt", "next sprint", "8 months"],
        "source": "user_auth.py:28",
        "priority": "medium",
    },
    {
        "id": "legal_vault",
        "description": "store_in_vault_on_success: False — a legal requirement from an audit, buried in a comment",
        "keywords": ["store_in_vault", "vault", "legal requirement", "audit", "do not store"],
        "source": "payment_processor.py:57",
        "priority": "medium",
    },
]


def score_coverage(questions, manifest):
    """
    Check which planted signals were caught by the generated questions.
    Returns a list of result dicts with caught=True/False for each signal.
    """
    # Build a single searchable string per question
    question_texts = []
    for q in questions:
        combined = f"{q.question_text} {q.reasoning} {q.code_reference}".lower()
        question_texts.append(combined)

    results = []
    for signal in manifest:
        caught = False
        matched_keyword = None
        for keyword in signal["keywords"]:
            if any(keyword.lower() in qt for qt in question_texts):
                caught = True
                matched_keyword = keyword
                break
        results.append({**signal, "caught": caught, "matched_keyword": matched_keyword})

    return results


# ── HTML report ────────────────────────────────────────────────────────────────

def build_html_report(questions, signals, coverage_results, elapsed, model):
    caught = sum(1 for r in coverage_results if r["caught"])
    total = len(coverage_results)
    pct = round(caught / total * 100) if total else 0
    pct_color = "#16a34a" if pct >= 80 else "#d97706" if pct >= 60 else "#dc2626"

    high_q = [q for q in questions if q.priority == "high"]
    med_q  = [q for q in questions if q.priority == "medium"]
    low_q  = [q for q in questions if q.priority == "low"]

    timestamp = datetime.now().strftime("%B %d, %Y at %I:%M %p")

    def priority_badge(p):
        colors = {"high": "#dc2626", "medium": "#d97706", "low": "#6b7280"}
        bg = colors.get(p, "#6b7280")
        return f'<span style="background:{bg};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">{p}</span>'

    def type_badge(t):
        icons = {"commit": "⎇", "file": "◻", "function": "ƒ", "ticket": "⊞", "cross_cutting": "⊕"}
        return f'<span style="color:#64748b;font-size:12px">{icons.get(t,"?")} {t}</span>'

    def question_card(q, num):
        border = {"high": "#fecaca", "medium": "#fde68a", "low": "#e2e8f0"}.get(q.priority, "#e2e8f0")
        return f"""
        <div style="background:#fff;border:1px solid {border};border-radius:8px;padding:20px 24px;margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            {priority_badge(q.priority)}
            {type_badge(q.reference_type)}
            <code style="background:#f1f5f9;padding:2px 8px;border-radius:4px;font-size:12px;color:#334155">{q.code_reference}</code>
          </div>
          <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#0f172a;font-weight:500">
            Q{num}. {q.question_text}
          </p>
          <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5">
            <strong style="color:#475569">Why it matters:</strong> {q.reasoning}
          </p>
        </div>"""

    def signal_row(r):
        if r["caught"]:
            icon = "✓"
            color = "#16a34a"
            bg = "#f0fdf4"
            border = "#bbf7d0"
        else:
            icon = "✗"
            color = "#dc2626"
            bg = "#fef2f2"
            border = "#fecaca"
        priority_dot = {"high": "🔴", "medium": "🟡", "low": "⚪"}.get(r["priority"], "⚪")
        return f"""
        <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 14px;background:{bg};border:1px solid {border};border-radius:6px;margin-bottom:8px">
          <span style="color:{color};font-weight:700;font-size:16px;flex-shrink:0;margin-top:1px">{icon}</span>
          <div style="flex:1">
            <div style="font-size:13px;color:#0f172a;font-weight:500">{priority_dot} {r['description']}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">Source: {r['source']}</div>
          </div>
        </div>"""

    all_question_cards = ""
    q_num = 1
    for section_label, group in [("High Priority", high_q), ("Medium Priority", med_q), ("Low Priority", low_q)]:
        if not group:
            continue
        colors = {"High Priority": "#dc2626", "Medium Priority": "#d97706", "Low Priority": "#6b7280"}
        all_question_cards += f"""
        <h3 style="color:{colors[section_label]};font-size:14px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;margin:28px 0 12px;border-bottom:1px solid #e2e8f0;padding-bottom:8px">
          {section_label} — {len(group)} question{'s' if len(group) != 1 else ''}
        </h3>"""
        for q in group:
            all_question_cards += question_card(q, q_num)
            q_num += 1

    signal_rows = "".join(signal_row(r) for r in coverage_results)

    pass1_rows = ""
    for s in signals[:20]:
        bar_filled = "█" * s.interest_score
        bar_empty = "░" * (10 - s.interest_score)
        evidence = s.raw_evidence[:100].replace("<", "&lt;").replace(">", "&gt;").replace("\n", " ")
        if len(s.raw_evidence) > 100:
            evidence += "…"
        pass1_rows += f"""
        <tr>
          <td style="padding:8px 12px;font-size:12px;color:#64748b">{s.signal_type}</td>
          <td style="padding:8px 12px;font-size:12px;color:#0f172a;font-weight:500">{s.headline}</td>
          <td style="padding:8px 12px;font-size:12px;color:#475569"><code>{s.coordinates}</code></td>
          <td style="padding:8px 12px;font-size:11px;color:#94a3b8;font-family:monospace">{bar_filled}<span style="color:#e2e8f0">{bar_empty}</span> {s.interest_score}</td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Legacy Whisperer — Question Report</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #0f172a; }}
    a {{ color: #3b82f6; }}
    code {{ font-family: 'SF Mono', 'Fira Code', monospace; }}
    details summary {{ cursor: pointer; }}
  </style>
</head>
<body>

<!-- Header -->
<div style="background:#0f172a;color:#fff;padding:20px 40px;display:flex;align-items:center;justify-content:space-between">
  <div>
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#64748b;margin-bottom:4px">Legacy Whisperer</div>
    <div style="font-size:20px;font-weight:700">Machine 1 — Question Report</div>
  </div>
  <div style="text-align:right;font-size:12px;color:#64748b">
    <div>{timestamp}</div>
    <div style="margin-top:4px">Model: {model}</div>
    <div style="margin-top:4px">Generated in {elapsed:.1f}s</div>
  </div>
</div>

<!-- Dashboard -->
<div style="background:#fff;border-bottom:1px solid #e2e8f0;padding:24px 40px;display:flex;gap:40px;align-items:center">
  <div style="text-align:center">
    <div style="font-size:48px;font-weight:800;color:{pct_color};line-height:1">{caught}/{total}</div>
    <div style="font-size:12px;color:#64748b;margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Signals caught ({pct}%)</div>
  </div>
  <div style="width:1px;background:#e2e8f0;height:60px"></div>
  <div style="text-align:center">
    <div style="font-size:48px;font-weight:800;color:#0f172a;line-height:1">{len(questions)}</div>
    <div style="font-size:12px;color:#64748b;margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Questions generated</div>
  </div>
  <div style="width:1px;background:#e2e8f0;height:60px"></div>
  <div style="display:flex;gap:24px">
    <div style="text-align:center">
      <div style="font-size:28px;font-weight:700;color:#dc2626">{len(high_q)}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">High</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:28px;font-weight:700;color:#d97706">{len(med_q)}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">Medium</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:28px;font-weight:700;color:#6b7280">{len(low_q)}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">Low</div>
    </div>
  </div>
  <div style="margin-left:auto;max-width:320px">
    <div style="font-size:12px;color:#64748b;margin-bottom:6px;font-weight:600">What "signals caught" means</div>
    <div style="font-size:12px;color:#94a3b8;line-height:1.5">The sample codebase has {total} deliberately planted pieces of weirdness. This score measures how many Machine 1 found and asked about. Aim for ≥80% before using this in a real interview.</div>
  </div>
</div>

<div style="max-width:1000px;margin:0 auto;padding:32px 40px">

  <!-- Signal coverage checklist -->
  <h2 style="font-size:18px;font-weight:700;margin-bottom:6px">Signal Coverage</h2>
  <p style="font-size:13px;color:#64748b;margin-bottom:20px">Did Machine 1 find and ask about each planted signal?</p>
  {signal_rows}

  <!-- Questions -->
  <h2 style="font-size:18px;font-weight:700;margin-top:40px;margin-bottom:6px">Generated Questions</h2>
  <p style="font-size:13px;color:#64748b;margin-bottom:20px">Read each question and ask: would a real engineer say "good question, let me explain"?</p>
  {all_question_cards}

  <!-- Pass 1 signals (collapsible) -->
  <details style="margin-top:40px">
    <summary style="font-size:18px;font-weight:700;margin-bottom:16px;list-style:none">
      ▸ Pass 1 Signals — All {len(signals)} found (click to expand)
    </summary>
    <p style="font-size:13px;color:#64748b;margin:12px 0 16px">These are the raw signals identified before question generation. Sorted by interest score.</p>
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Type</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Headline</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Location</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Score</th>
        </tr>
      </thead>
      <tbody>
        {pass1_rows}
      </tbody>
    </table>
    </div>
  </details>

</div>

<div style="background:#f1f5f9;border-top:1px solid #e2e8f0;padding:16px 40px;font-size:12px;color:#94a3b8;margin-top:40px">
  Legacy Whisperer — Machine 1 Test Report · {timestamp}
</div>

</body>
</html>"""


# ── Main ───────────────────────────────────────────────────────────────────────

def run_test(verbose=False, model="claude-opus-4-7", open_browser=True):
    for p in [SAMPLE_DIR, SAMPLE_DIR / "commit_log.txt", SAMPLE_DIR / "tickets.csv"]:
        if not p.exists():
            print(f"Error: missing {p}", file=sys.stderr)
            sys.exit(1)

    print(f"Running Machine 1 against sample_codebase/ with {model}...")
    if not verbose:
        print("(pass --verbose to see pipeline progress)\n")

    start = time.time()
    questions, signals = generate_questions(
        codebase_path=str(SAMPLE_DIR),
        commit_log_path=str(SAMPLE_DIR / "commit_log.txt"),
        tickets_path=str(SAMPLE_DIR / "tickets.csv"),
        model=model,
        max_questions=25,
        verbose=verbose,
    )
    elapsed = time.time() - start

    coverage_results = score_coverage(questions, SIGNAL_MANIFEST)
    caught = sum(1 for r in coverage_results if r["caught"])
    total = len(coverage_results)
    pct = round(caught / total * 100) if total else 0

    # Terminal summary
    print(f"\nDone in {elapsed:.1f}s")
    print(f"Questions generated: {len(questions)}  ({sum(1 for q in questions if q.priority=='high')} high / {sum(1 for q in questions if q.priority=='medium')} medium / {sum(1 for q in questions if q.priority=='low')} low)")
    print(f"Signal coverage:     {caught}/{total} ({pct}%)")
    print()

    missed = [r for r in coverage_results if not r["caught"]]
    if missed:
        print("Missed signals:")
        for r in missed:
            print(f"  ✗ {r['description'][:80]}")
        print()

    # Write HTML report
    html = build_html_report(questions, signals, coverage_results, elapsed, model)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = Path(__file__).parent / f"report_{timestamp}.html"
    report_path.write_text(html, encoding="utf-8")
    print(f"Report saved: {report_path}")

    if open_browser:
        import webbrowser
        webbrowser.open(report_path.as_uri())
        print("Opening in browser...")

    return questions, signals, coverage_results


def main():
    parser = argparse.ArgumentParser(description="Test Machine 1 and open an HTML report")
    parser.add_argument("--model", default="claude-opus-4-7",
                        help="Claude model (default: claude-opus-4-7; use claude-sonnet-4-6 to iterate faster)")
    parser.add_argument("--verbose", action="store_true", help="Show pipeline progress")
    parser.add_argument("--no-browser", action="store_true", help="Save report but don't open browser")
    args = parser.parse_args()

    run_test(verbose=args.verbose, model=args.model, open_browser=not args.no_browser)


if __name__ == "__main__":
    main()
