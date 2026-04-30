#!/usr/bin/env python3
"""
Test for the post-interview knowledge extraction pipeline.

Runs a 10-turn fake transcript through all three pipeline stages
and writes test_output.md + test_output.json.

Usage:
    python test_step2.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from pipeline.knowledge_pipeline import (
    extract_knowledge,
    generate_output,
    link_code_references,
)

SAMPLE_DIR = Path(__file__).parent / "sample_codebase"
PROJECT_NAME = "Catalog Sync Service"

# ── Fake transcript ────────────────────────────────────────────────────────────
# 5 Q&A pairs (10 turns) covering the key signals in sample_codebase.
# Engineer answers are based on the institutional knowledge in ANSWER_KEY.md.

TRANSCRIPT = [
    {
        "speaker": "ai",
        "text": "config.py line 1 sets SYNC_CHUNK_SIZE = 847. That's a very specific number that's changed at least twice in the commit history. What determined that exact value?",
        "question_id": "q1",
    },
    {
        "speaker": "engineer",
        "text": "847 is the maximum the warehouse API will accept per batch call without failing. We discovered the limit empirically in production — tried 1000 first and got silent partial results with no error. Backed down to 850, still failed intermittently. Tested 848, 849, all of those had occasional failures. 847 has been stable for months. That number is sacred. Don't change it without getting written confirmation from the warehouse team that their actual limit has changed.",
        "question_id": "q1",
    },
    {
        "speaker": "ai",
        "text": "In transformers.py line 19, normalize_price is called on the description field with a '# fix' comment. That seems wrong for a function called normalize_price. What's the story?",
        "question_id": "q2",
    },
    {
        "speaker": "engineer",
        "text": "That's a hack from a bad supplier data import in late 2022. Their product descriptions came with HTML entities all through them — &amp;, &nbsp;, &lt;, the works — because of their CMS export tool. normalize_price already had string handling in it, so I shoved the HTML entity stripping logic in there and called it on the description field too. The function name is totally misleading. It was supposed to be a two-day fix. It's been over a year. Removing the description call would silently corrupt product descriptions for that supplier's entire catalog, so it's stuck there now.",
        "question_id": "q2",
    },
    {
        "speaker": "ai",
        "text": "In connectors/storefront.py, StorefrontConflictError is caught and silently passed — no log, no counter, nothing. Why is the 409 conflict being swallowed?",
        "question_id": "q3",
    },
    {
        "speaker": "engineer",
        "text": "The operations team manages about 50 to 60 products manually directly on the storefront — special pricing tiers, custom promotional configurations. When sync tries to update those, the storefront returns a 409 because the product already exists with settings it doesn't want overwritten. We were logging those as errors and it was generating 60-plus Slack alerts a day that the ops team immediately dismissed every single time. So we made the call to swallow them silently. The tradeoff is real though — it's why SYNC-007 price discrepancies keep appearing. If one of those manually managed products gets a legitimate price change pushed through the sync, it will silently fail.",
        "question_id": "q3",
    },
    {
        "speaker": "ai",
        "text": "ENABLE_DELTA_SYNC is False in config but there's a full implementation in sync_engine.py. Commit 5e39e0d just says 'disable delta sync' after three fix commits. What was broken?",
        "question_id": "q4",
    },
    {
        "speaker": "engineer",
        "text": "Delta sync worked fine in testing but failed on a specific production edge case. When a product gets a catalog edit and a price update in the same sync window, the price update comes from a separate pricing service that writes to price_updated_at, not updated_at. Our delta filter in sync_products only checked updated_at. So products in that state would be invisible to the delta filter and their price changes would silently stop syncing. Fixing it properly would have required coordinating with the pricing team to unify the timestamp fields, which was deprioritized. The full sync runtime is acceptable so I just disabled it. If you ever want to re-enable ENABLE_DELTA_SYNC, you need to fix the cursor logic in sync_products to check both timestamp fields.",
        "question_id": "q4",
    },
    {
        "speaker": "ai",
        "text": "MERCHANT_OVERRIDE_IDS hardcodes merchants 1042 and 7731 to force them through send_to_warehouse instead of send_to_warehouse_v2. What's different about those two merchants?",
        "question_id": "q5",
    },
    {
        "speaker": "engineer",
        "text": "Those two merchants were onboarded before we built the v2 warehouse API. They have data contracts with the warehouse that specify the old v1 payload structure — different field names, Bearer token auth instead of API key auth. If their records go through send_to_warehouse_v2, the warehouse rejects the payload with a 422 because the schema doesn't match their contract. The override in _select_warehouse_fn forces them to v1 regardless of region. To fully sunset v1, you'd need to work with the warehouse team to migrate their contracts to the v2 schema. The warehouse team says it's on their roadmap but it's been on their backlog for over a year. If any future merchant needs v1 for the same reason, add their merchant ID to MERCHANT_OVERRIDE_IDS in config.py.",
        "question_id": "q5",
    },
]


def main():
    print("=" * 60)
    print("  LEGACY WHISPERER — Step 2 Test")
    print("=" * 60)
    print(f"  Transcript: {len(TRANSCRIPT)} turns ({len(TRANSCRIPT) // 2} Q&A pairs)")
    print(f"  Codebase:   {SAMPLE_DIR}")
    print()

    # ── Pass 1: Extract knowledge ──────────────────────────────────────────────
    print("Pass 1: Extracting knowledge items from transcript...")
    items = extract_knowledge(TRANSCRIPT)
    print(f"  → {len(items)} items extracted\n")

    if not items:
        print("No items extracted. Check ANTHROPIC_API_KEY and prompts.")
        sys.exit(1)

    for item in items:
        print(f"  [{item.category.upper()}] {item.title}  (confidence: {item.confidence:.0%})")
    print()

    # ── Pass 2: Link code references ──────────────────────────────────────────
    print("Pass 2: Linking code references...")
    items = link_code_references(items, str(SAMPLE_DIR))

    for item in items:
        refs_str = ", ".join(f"{r.file}:{r.line_start}" for r in item.code_references)
        print(f"  [{item.category}] {item.title[:50]}")
        print(f"    refs: {refs_str or '(none found)'}")
    print()

    # ── Pass 3: Generate output ────────────────────────────────────────────────
    print("Pass 3: Generating output documents...")
    html, markdown, json_data = generate_output(items, PROJECT_NAME)

    out_dir = Path(__file__).parent
    html_path = out_dir / "test_output.html"
    md_path = out_dir / "test_output.md"
    json_path = out_dir / "test_output.json"

    html_path.write_text(html, encoding="utf-8")
    md_path.write_text(markdown, encoding="utf-8")
    json_path.write_text(json.dumps(json_data, indent=2), encoding="utf-8")

    print(f"  → {html_path}")
    print(f"  → {md_path}")
    print(f"  → {json_path}")
    print()

    # ── Summary ────────────────────────────────────────────────────────────────
    by_cat = {}
    for item in items:
        by_cat[item.category] = by_cat.get(item.category, 0) + 1

    items_with_refs = sum(1 for i in items if i.code_references)

    print("=" * 60)
    print("  SUMMARY")
    print("=" * 60)
    print(f"  Knowledge items:  {len(items)}")
    print(f"  With code refs:   {items_with_refs}/{len(items)}")
    print(f"  By category:      {', '.join(f'{v} {k}' for k, v in sorted(by_cat.items()))}")
    print(f"  Markdown length:  {len(markdown.splitlines())} lines")
    print()


if __name__ == "__main__":
    main()
