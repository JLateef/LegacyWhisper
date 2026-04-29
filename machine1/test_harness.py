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

SAMPLE_DIR = Path(__file__).parent / "sample_codebase"

# ── Signal manifest ────────────────────────────────────────────────────────────
# The 14 pieces of weirdness deliberately planted in sample_codebase/.
# A signal is "caught" if any of its keywords appear in a generated question
# (question_text + reasoning + code_reference, case-insensitive).
# Full institutional knowledge for each signal is in ANSWER_KEY.md.

SIGNAL_MANIFEST = [
    {
        "id": "chunk_size_847",
        "description": "SYNC_CHUNK_SIZE = 847 — specific value arrived at empirically against undocumented warehouse API limit",
        "keywords": ["sync_chunk_size", "chunk_size", "chunk size", "847", "chunk of 847"],
        "source": "config.py:1",
        "priority": "high",
    },
    {
        "id": "legacy_sku_branch",
        "description": "LEGACY_ SKU prefix routes to _apply_legacy_corrections — encoding fix for migrated products",
        "keywords": ["legacy_", "legacy_sku", "legacy sku", "startswith", "apply_legacy", "encoding"],
        "source": "transformers.py:12",
        "priority": "high",
    },
    {
        "id": "normalize_price_on_description",
        "description": "normalize_price() called on description field — function secretly strips HTML entities, used for side effect",
        "keywords": ["normalize_price", "description", "# fix", "html", "entity", "price.*description"],
        "source": "transformers.py:19",
        "priority": "high",
    },
    {
        "id": "storefront_conflict_swallow",
        "description": "StorefrontConflictError silently caught and swallowed — 409s from storefront are silently ignored",
        "keywords": ["storefrontconflicterror", "conflict", "409", "silent", "swallow", "pass"],
        "source": "connectors/storefront.py:22",
        "priority": "high",
    },
    {
        "id": "warehouse_v1_v2",
        "description": "send_to_warehouse and send_to_warehouse_v2 — near-identical functions with different auth and payload schemas",
        "keywords": ["send_to_warehouse_v2", "warehouse_v2", "v2", "v1.*v2", "two.*warehouse", "both"],
        "source": "connectors/warehouse.py:35",
        "priority": "high",
    },
    {
        "id": "delta_sync_disabled",
        "description": "ENABLE_DELTA_SYNC = False — full implementation exists but feature is disabled",
        "keywords": ["enable_delta_sync", "delta_sync", "delta sync", "disabled", "false"],
        "source": "config.py:2",
        "priority": "high",
    },
    {
        "id": "old_code_style",
        "description": "_handle_standard_format uses Python 2-era style (type(), % formatting) vs modern rest of file",
        "keywords": ["_handle_standard_format", "_handle_legacy_format", "old style", "type(v)", "%.4f", "formatting"],
        "source": "transformers.py:53",
        "priority": "medium",
    },
    {
        "id": "force_full_dead_param",
        "description": "force_full parameter only matters when ENABLE_DELTA_SYNC=True, which it isn't",
        "keywords": ["force_full", "force full", "delta.*force", "parameter.*no effect"],
        "source": "sync_engine.py:28",
        "priority": "medium",
    },
    {
        "id": "warehouse_none_check",
        "description": "if warehouse_response is None — defensive check for a condition the current library no longer produces",
        "keywords": ["warehouse_response is none", "warehouse_response", "response is none", "none check"],
        "source": "sync_engine.py:43",
        "priority": "medium",
    },
    {
        "id": "initialize_ordering",
        "description": "initialize() must be called before sync_products() — implicit dependency, no enforcement",
        "keywords": ["initialize", "_state", "order", "before.*sync", "cursor.*none", "dependency"],
        "source": "sync_engine.py:14",
        "priority": "high",
    },
    {
        "id": "handle_legacy_format_dead",
        "description": "_handle_legacy_format has no direct callers — called via globals() from dispatch_handler string lookup",
        "keywords": ["_handle_legacy_format", "handle_legacy", "no.*caller", "dead code", "globals", "dispatch"],
        "source": "transformers.py:68",
        "priority": "high",
    },
    {
        "id": "sleep_per_record",
        "description": "time.sleep(0.3) per record inside storefront push loop — rate limit workaround, scales with catalog size",
        "keywords": ["sleep(0.3)", "0.3", "per record", "per-record", "increase sleep", "rate limit.*sleep"],
        "source": "sync_engine.py:52",
        "priority": "high",
    },
    {
        "id": "merchant_override_ids",
        "description": "MERCHANT_OVERRIDE_IDS = [1042, 7731] — two merchants hardcoded to force v1 warehouse connector",
        "keywords": ["merchant_override_ids", "1042", "7731", "override.*merchant", "merchant.*override"],
        "source": "config.py:5",
        "priority": "high",
    },
    {
        "id": "no_rollback",
        "description": "Warehouse updated before storefront; storefront failures leave warehouse ahead with no rollback",
        "keywords": ["rollback", "no rollback", "warehouse.*storefront", "partial failure", "discrepancy", "compensat"],
        "source": "sync_engine.py:43-54",
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
    for p in [SAMPLE_DIR, SAMPLE_DIR / "commit_history.txt", SAMPLE_DIR / "tickets.csv"]:
        if not p.exists():
            print(f"Error: missing {p}", file=sys.stderr)
            sys.exit(1)

    print(f"Running Machine 1 against sample_codebase/ with {model}...")
    if not verbose:
        print("(pass --verbose to see pipeline progress)\n")

    start = time.time()
    questions, signals = generate_questions(
        codebase_path=str(SAMPLE_DIR),
        commit_log_path=str(SAMPLE_DIR / "commit_history.txt"),
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
