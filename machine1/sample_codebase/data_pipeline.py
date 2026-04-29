"""
Daily merchant settlement batch processor.
Originally written for ~500 merchants. Now handling ~50,000.
Performance has been an adventure. See post-mortem 2023-08-15.
"""

import time
from datetime import datetime, timezone

# DO NOT change BATCH_SIZE without reading the full comment below and talking to ops.
# This is not an arbitrary number.
BATCH_SIZE = 47

# Settlement runs at 2 AM UTC. Do not change without coordinating with finance.
# NYSE trading hours are 14:30-21:00 UTC; we avoid running during market hours
# because our clearing bank has higher error rates during peak trading volume.
SETTLEMENT_HOUR_UTC = 2

# This job has a hard deadline: must complete before 6 AM UTC for same-day clearing.
# At 50k merchants with current batch size and sleep, it takes ~5.5 hours.
# We are 30 minutes away from missing the deadline. Do not slow this down further.
DEADLINE_HOUR_UTC = 6


def run_daily_settlement():
    merchants = get_all_active_merchants()
    total = len(merchants)
    failed_batches = []

    for i in range(0, total, BATCH_SIZE):
        batch = merchants[i : i + BATCH_SIZE]
        results = _process_batch(batch)

        # Sleep between batches to respect the payment processor's rate limit.
        # The rate limit is ~50 concurrent requests per second — undocumented,
        # discovered via the August 2023 incident (see post-mortem).
        # 47 requests + 2.1s sleep gives us the buffer to handle retries.
        # 2.1 not 2.0 — see the post-mortem for why the extra 100ms matters.
        time.sleep(2.1)

        failed = [r for r in results if not r["success"]]
        if failed:
            # DO NOT raise here — it stops the entire batch run.
            # Partial failures are reconciled by the nightly reconciliation job.
            # This behavior is intentional and finance is aware of it.
            failed_batches.extend(failed)
            _log_partial_failure(failed)

    if failed_batches:
        _notify_ops(f"Settlement complete with {len(failed_batches)} failures out of {total}")


def _process_batch(merchants):
    results = []
    for merchant in merchants:
        try:
            result = _settle_merchant(merchant)
            results.append({"merchant_id": merchant.id, "success": True, "result": result})
        except Exception as e:
            results.append({"merchant_id": merchant.id, "success": False, "error": str(e)})
    return results


def _settle_merchant(merchant):
    balance = get_pending_balance(merchant.id)
    if balance == 0:
        return {"skipped": True, "reason": "zero balance"}

    # Merchants with the "held" flag skip settlement and go to manual review.
    # The held flag is set manually by the compliance team — there is no UI for it,
    # it has to be set directly in the database. This was supposed to be temporary.
    if merchant.held:
        _notify_compliance(merchant.id, balance)
        return {"skipped": True, "reason": "held for compliance review"}

    return initiate_transfer(merchant.id, balance, merchant.bank_account_id)


def reprocess_failed_settlements(date_str):
    # This function is called manually when the nightly reconciliation job
    # identifies mismatches. It is NOT called automatically — running it
    # automatically would create duplicate transfers in certain edge cases
    # that took us 3 weeks to debug in Q4 2022.
    records = get_failed_settlements_for_date(date_str)
    for record in records:
        try:
            _settle_merchant(record.merchant)
        except Exception:
            pass  # if reprocessing fails, it goes into the next day's reconciliation
