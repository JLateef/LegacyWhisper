# Answer Key — Sample Codebase v2

This file documents the 14 planted signals in `sample_codebase/`. It must never
be read by the question generator. Its purpose is grading: compare Machine 1's
output against these signals to evaluate coverage and question quality.

---

## Signal 1 — Hardcoded value: `SYNC_CHUNK_SIZE = 847`

**Location:** `config.py:1`
**Signal type:** hardcoded_value
**Related ticket:** SYNC-004 (slow sync), SYNC-009 (capacity request)
**Related commits:** `7065a6f7` ("update chunk size"), `8176f7e8` ("fix"), `c0f1a2b3` ("update chunk size")

**Institutional knowledge:**
The warehouse API enforces an undocumented burst limit of roughly 850 records per batch call. This was discovered after two production incidents where batches of 1000 and then 500 silently returned partial results with no error. 847 was arrived at empirically over three weeks of testing: 850 failed intermittently, 849 failed once, 848 never failed in testing, 847 was chosen for the extra buffer. There is no documentation from the warehouse vendor. The number has changed three times in the commit history as the team probed the actual limit.

**Good question Machine 1 should generate:**
"SYNC_CHUNK_SIZE is set to 847 in config.py — that's a very specific number that's appeared in at least two 'update chunk size' commits. Why that exact number and not something rounder like 800 or 1000?"

---

## Signal 2 — Special case for subset: `LEGACY_` SKU prefix

**Location:** `transformers.py:12`
**Signal type:** special_case_subset
**Related ticket:** SYNC-005 (garbled characters)
**Related commit:** `a398d9c0` ("add legacy product handling")

**Institutional knowledge:**
Products with the `LEGACY_` SKU prefix were migrated from the company's previous catalog system (a Magento 1.x installation) in early 2022. That system stored text fields as ISO-8859-1 while the current system uses UTF-8. The `_apply_legacy_corrections` function re-encodes these fields to prevent character corruption. There are approximately 340 affected products. The plan was to re-import them properly encoded and remove this branch, but the re-import was cut from the migration project budget. The branch is now permanent. Removing it silently corrupts product titles and descriptions for those 340 SKUs.

**Good question Machine 1 should generate:**
"There's a branch in `normalize_record` that specifically checks if a SKU starts with `LEGACY_` and applies corrections. What are these products, and what happens if that branch is removed?"

---

## Signal 3 — Function name mismatch: `normalize_price` called on `description`

**Location:** `transformers.py:19`
**Signal type:** function_name_mismatch
**Related ticket:** SYNC-011 (description formatting artifacts)
**Related commit:** `86b7c8d9` ("update transformers")

**Institutional knowledge:**
In late 2022, a bulk data import from a third-party supplier delivered product descriptions containing HTML entities (`&amp;`, `&nbsp;`, `&lt;`) from their CMS export tool. The quick fix was to add HTML entity stripping logic inside `normalize_price` — because that function already had string handling — and then call it on the description field too. It was meant to be temporary. The comment `# fix` is the only acknowledgment. The function was never renamed or split. Any engineer reading `normalize_record` without reading `normalize_price`'s body would not understand why a price normalization function is being called on a description field.

**Good question Machine 1 should generate:**
"In `normalize_record`, `normalize_price` is called on the description field, not just on price. What does `normalize_price` actually do to a string value, and why is it being used there?"

---

## Signal 4 — Swallowed exception: `StorefrontConflictError`

**Location:** `connectors/storefront.py:22`
**Signal type:** error_swallowing
**Related tickets:** SYNC-002 (products not updating), SYNC-007 (price discrepancy)
**Related commits:** `b384f5e6` ("hotfix"), `c495e6d7` ("revert"), `d506d7c8` ("revert the revert"), `e617c8b9` ("fix storefront connector"), `0839a0f1` ("actually fix the thing")

**Institutional knowledge:**
The storefront platform returns HTTP 409 when a push targets a product that was manually created on the storefront side before the sync system was aware of it. The operations team has approximately 50-80 products managed this way — products with special pricing tiers, custom display configurations, or embedded promotions that the sync system would overwrite. The decision to silently swallow the 409 was made after the operations team asked to suppress these errors: they were generating ~60 alerts per day that would be immediately dismissed. The swallowed errors are the reason some products listed in SYNC-002 and SYNC-007 appear not to update — the sync "succeeds" from the system's perspective but silently skips the storefront push. The revert pair in the commit history (`c495e6d7` / `d506d7c8`) reflects a brief attempt to log these that was reversed after ops complained about the noise.

**Good question Machine 1 should generate:**
"In `push_to_storefront`, `StorefrontConflictError` is caught and silently ignored — no logging, no retry, no return value. Why are 409 conflicts being silently dropped rather than logged or retried?"

---

## Signal 5 — Near-identical functions: `send_to_warehouse` vs `send_to_warehouse_v2`

**Location:** `connectors/warehouse.py:10` and `connectors/warehouse.py:35`
**Signal type:** near_identical_functions
**Related commit:** `9162b3a4` ("add warehouse v2")

**Institutional knowledge:**
`send_to_warehouse_v2` was written in June 2023 when the company added a west-coast fulfillment facility that runs a different version of the warehouse API. The v2 API uses API key authentication instead of OAuth Bearer tokens, a different payload structure (`items` instead of `records`, `client_id` instead of `source`), and a longer timeout because the west facility's API is hosted further from the application servers. A migration to route all traffic through v2 was planned but paused after a validation incident where products in certain categories failed schema validation against the v2 API. Those categories are still routed through v1. The `_select_warehouse_fn` logic in `sync_engine.py` is the routing layer. The subtle difference in code style (% formatting vs f-strings) also reflects that the two functions were written at different times.

**Good question Machine 1 should generate:**
"There are two nearly identical warehouse send functions — `send_to_warehouse` and `send_to_warehouse_v2`. They have different payload structures and auth schemes. What's the actual difference and when is each one used?"

---

## Signal 6 — Config flag with non-obvious default: `ENABLE_DELTA_SYNC = False`

**Location:** `config.py:2`
**Signal type:** config_flag_default
**Related ticket:** SYNC-003 (duplicate warehouse records)
**Related commits:** `f8e3e4d5` ("add delta sync"), `5e39e0d1` ("disable delta sync")

**Institutional knowledge:**
Delta sync was fully implemented and tested before being disabled. It was disabled because of a specific edge case discovered in production: when a product's price is updated by the automated pricing engine at the same time as a catalog edit, the delta filter uses `updated_at` but the pricing engine updates `price_updated_at` (a separate field on the product record). Products in that window would be missed by the delta filter and their price changes would not sync. Rather than add a second timestamp check or fix the filtering logic, the team disabled the feature. The infrastructure cost of full syncs is low enough that it was not worth the complexity. SYNC-003 (duplicate records) was what triggered the investigation that led to disabling it — the duplicates were a side effect of a workaround that was attempted before disabling.

**Good question Machine 1 should generate:**
"`ENABLE_DELTA_SYNC` is set to `False` in config, but there's clearly a full implementation in `sync_engine.py`. Commit `5e39e0d1` disables it after `f8e3e4d5` added it. Why was it disabled?"

---

## Signal 7 — Older code path: `_handle_standard_format` and `_handle_legacy_format`

**Location:** `transformers.py:53` and `transformers.py:68`
**Signal type:** older_code_path
**Related commit:** `2b10f1e2` ("initial commit")

**Institutional knowledge:**
These two functions were written by a contractor in early 2022 who came from a Python 2 background. The rest of the codebase was written later by engineers more familiar with modern Python. The stylistic differences are visible: `type(v) == str` instead of `isinstance()`, `"%.4f" % v` instead of f-strings, `None` comparison via `is None` (correct) but preceded by explicit `type()` checks (redundant). During the September 2023 refactor (commit `1940f1e2`), these functions were deliberately not touched because all tests were passing and no one wanted to change transformation logic that touched every record.

**Good question Machine 1 should generate:**
"`_handle_standard_format` and `_handle_legacy_format` use noticeably different Python style from the rest of the file — `type()` instead of `isinstance()`, `%` string formatting instead of f-strings. Were these written by someone else? Why weren't they updated in the refactor?"

---

## Signal 8 — Parameter only used in one branch: `force_full`

**Location:** `sync_engine.py:28`
**Signal type:** parameter_one_branch

**Institutional knowledge:**
The `force_full` parameter was added when `ENABLE_DELTA_SYNC` was `True`, to allow operators to force a complete re-sync when they suspected the delta filter had missed updates. Since `ENABLE_DELTA_SYNC = False`, the `force_full` parameter has no effect — `sync_products` always does a full sync regardless. Callers in `scheduler.py` pass `force_full=True` when invoking `run_full_sync`, believing they are explicitly requesting a full sync, which they are — but only because everything is a full sync now, not because of `force_full`. Removing the parameter would require updating callers and is considered safe.

**Good question Machine 1 should generate:**
"`sync_products` has a `force_full` parameter, but looking at the code, it only changes behavior when `ENABLE_DELTA_SYNC` is `True` — which it isn't. What was `force_full` originally for and is it safe to remove?"

---

## Signal 9 — Defensive check for impossible condition: `if warehouse_response is None`

**Location:** `sync_engine.py:43`
**Signal type:** defensive_check

**Institutional knowledge:**
An early version of the internal HTTP client wrapper library (WarehouseClient 0.2.x) had a bug where SSL handshake failures during initial connection would return `None` instead of raising an exception. This was fixed in 0.3.0. The check was added during the period when 0.2.x was in use and was never removed when the library was upgraded. With the current library version, `send_to_warehouse` and `send_to_warehouse_v2` always either return a dict or return `None` explicitly on error — but the original reason the check exists was a different, now-fixed code path. Removing it is safe with the current library version.

**Good question Machine 1 should generate:**
"There's a check for `warehouse_response is None` in `sync_engine.py` right after calling the warehouse connector. Both connector functions already return `None` on error explicitly — what scenario was this check originally defending against?"

---

## Signal 10 — Implicit ordering dependency: `initialize()` before `sync_products()`

**Location:** `sync_engine.py:14` (`_state` dict), `sync_engine.py:19` (`initialize`)
**Signal type:** implicit_dependency
**Related commit:** `5e43c4b5` ("add scheduler")

**Institutional knowledge:**
`initialize()` populates `_state["cursor"]` from the database, which `sync_products()` uses for delta filtering. If `sync_products()` is called without `initialize()`, `_state["cursor"]` is `None`, which causes the delta filter to include all records (effectively a full sync) — with no error or warning. This has caused two QA incidents where tests called `sync_products()` directly without `initialize()` and passed despite testing the wrong code path. There is no enforcement (no guard clause, no assertion). The ordering is enforced only by convention in `scheduler.py`. `ENABLE_DELTA_SYNC = False` means this is currently low-risk, but if delta sync is ever re-enabled, calling out of order becomes a silent correctness bug.

**Good question Machine 1 should generate:**
"`initialize()` populates the `_state` dict that `sync_products()` reads. What happens if `sync_products()` is called without calling `initialize()` first, and is that enforced anywhere?"

---

## Signal 11 — Code that looks dead but isn't: `_handle_legacy_format`

**Location:** `transformers.py:68`
**Signal type:** dead_code_not_dead
**Related to:** `config.py:10` (`DISPATCH_HANDLERS`)

**Institutional knowledge:**
`_handle_legacy_format` has no direct callers in the codebase. Any IDE, static analysis tool, or grep for callers will show it as unused. It is called dynamically via `dispatch_handler()`, which uses `globals().get(handler_name)` to look up the function by the string `"_handle_legacy_format"` stored in `DISPATCH_HANDLERS` in `config.py`. It is invoked for any product record where `format_type == "legacy"` — a subset of products imported from a specific supplier system. Removing the function would cause `dispatch_handler` to silently fall back to `_handle_standard_format` for those records, resulting in incorrect field mapping for that supplier's data with no error raised.

**Good question Machine 1 should generate:**
"`_handle_legacy_format` in `transformers.py` appears to have no direct callers anywhere in the codebase. Is it actually called? How would you know not to delete it during a cleanup?"

---

## Signal 12 — Timing-sensitive code: `time.sleep(0.3)` per record

**Location:** `sync_engine.py:52`
**Signal type:** timing_sensitive
**Related ticket:** SYNC-001 (weekend failure rate), SYNC-004 (slow sync)
**Related commit:** `97c8d9e0` ("increase sleep")

**Institutional knowledge:**
The storefront API has an undocumented rate limit of approximately 3 write operations per second per API client. This was discovered after the initial production deployment caused a rate limiting incident where ~600 products failed with 429 responses. The sleep was initially 0.1s (too fast, hit rate limit), then 0.2s (still too fast during peak catalog sizes), then increased to 0.3s in commit `97c8d9e0` (stable). The sleep is inside the per-record loop rather than the per-batch loop because the rate limit is per-request. The consequence is that syncing a 12,000-product catalog takes a minimum of 60 minutes in sleep alone. SYNC-001's elevated weekend failure rate is related — weekend traffic causes the storefront API's rate limit to be enforced more strictly, meaning the 0.3s sleep is only barely sufficient.

**Good question Machine 1 should generate:**
"There's a `time.sleep(0.3)` inside the per-record loop in `sync_products` — for a 12,000-product catalog that's 60 minutes of sleeping. Commit `97c8d9e0` is titled 'increase sleep'. Why is the sleep per-record rather than per-batch, and why 0.3 specifically?"

---

## Signal 13 — Special case for subset: `MERCHANT_OVERRIDE_IDS = [1042, 7731]`

**Location:** `config.py:5`, `sync_engine.py:58`
**Signal type:** special_case_subset
**Related ticket:** SYNC-006 (merchant 1042 not syncing)
**Related commit:** `4273c4b5` ("add merchant overrides")

**Institutional knowledge:**
Merchants 1042 and 7731 signed data contracts with the warehouse before the v2 API was available. Their contracts specify the v1 payload structure (`records` key, `source` field, Bearer token auth). The warehouse has per-merchant schema validation rules; if these merchants' data arrives via the v2 path, the warehouse API returns a 422 because the payload structure doesn't match their contract. The plan was to migrate their contracts to the v2 schema, but the warehouse team's roadmap has this as low priority and it has not been scheduled. The override in `_select_warehouse_fn` forces v1 for any batch containing these merchant IDs, regardless of warehouse region.

**Good question Machine 1 should generate:**
"`MERCHANT_OVERRIDE_IDS = [1042, 7731]` in config forces those merchants through the v1 warehouse connector regardless of region. Why those specific merchants? What breaks if they go through v2?"

---

## Signal 14 — Design decision never documented: no rollback on partial failure

**Location:** `sync_engine.py:43–54`
**Signal type:** cross_cutting
**Related ticket:** SYNC-007 (price discrepancy between storefront and warehouse)

**Institutional knowledge:**
The sync updates the warehouse first, then the storefront. If the warehouse succeeds but a storefront push fails (including silent `StorefrontConflictError` swallows), the warehouse has current data but the storefront is stale. This creates a discrepancy window. The original design explicitly decided not to implement rollback for three reasons: (1) warehouse rollbacks require a separate compensating API call that is not atomic; (2) storefront failures are common enough that rolling back the warehouse for each one would cause more disruption than the discrepancy; (3) a nightly reconciliation job (external, not in this codebase) closes the gap within hours. This decision was made in a design meeting and never written down. SYNC-007 (price discrepancies) reopened twice because the resolution "Monitoring. Closed." does not actually fix the root cause — it is an accepted design behavior.

**Good question Machine 1 should generate:**
"In `sync_products`, the warehouse is updated before the storefront. If a storefront push fails after the warehouse already succeeded, there's no rollback. Is that intentional? What happens to those records?"

---

## Scoring guide

| Coverage | Assessment |
|----------|-----------|
| 12–14 / 14 | Excellent — prompts are working |
| 9–11 / 14 | Good — review which signal types are being missed |
| 6–8 / 14 | Marginal — likely missing commit or ticket signals; check Pass 1 |
| < 6 / 14 | Poor — prompts need significant revision |

Signals 1, 3, 4, 6, 12 are the hardest to catch because they require reading the code and understanding what it does, not just pattern-matching keywords. If Machine 1 misses all five, the codebase context is not being fully utilized.

Signal 11 is specifically designed to test whether Machine 1 can reason about what is NOT present (no direct callers) rather than what IS present.
