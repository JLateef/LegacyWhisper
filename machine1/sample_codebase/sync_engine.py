import time
import logging
import uuid

from config import SYNC_CHUNK_SIZE, ENABLE_DELTA_SYNC, MERCHANT_OVERRIDE_IDS
from transformers import normalize_record
from connectors.warehouse import send_to_warehouse, send_to_warehouse_v2
from connectors.storefront import push_to_storefront

logger = logging.getLogger(__name__)

_state = {
    "initialized": False,
    "cursor": None,
    "session": None,
}


def initialize(db_connection):
    _state["initialized"] = True
    _state["cursor"] = _load_cursor(db_connection)
    _state["session"] = str(uuid.uuid4())


def sync_products(products, force_full=False):
    results = {"synced": 0, "failed": 0, "skipped": 0}

    working_set = products
    if ENABLE_DELTA_SYNC and not force_full:
        working_set = [p for p in products if p.get("updated_at", 0) > (_state["cursor"] or 0)]

    for chunk in _chunk(working_set, SYNC_CHUNK_SIZE):
        normalized = []
        for product in chunk:
            try:
                normalized.append(normalize_record(product))
            except Exception:
                results["failed"] += 1

        if not normalized:
            continue

        send_fn = _select_warehouse_fn(normalized)
        warehouse_response = send_fn(normalized)

        if warehouse_response is None:
            results["skipped"] += len(normalized)
            continue

        for record in normalized:
            try:
                push_to_storefront(record)
                results["synced"] += 1
            except Exception as e:
                logger.error("storefront error for %s: %s", record.get("sku"), e)
                results["failed"] += 1
            time.sleep(0.3)

    return results


def _select_warehouse_fn(records):
    merchant_ids = {r.get("merchant_id") for r in records}
    if merchant_ids & set(MERCHANT_OVERRIDE_IDS):
        return send_to_warehouse
    regions = {r.get("warehouse_region") for r in records}
    if "west" in regions:
        return send_to_warehouse_v2
    return send_to_warehouse


def _chunk(lst, size):
    for i in range(0, len(lst), size):
        yield lst[i : i + size]


def _load_cursor(db):
    try:
        row = db.execute("SELECT MAX(synced_at) FROM sync_log").fetchone()
        return row[0] if row and row[0] else None
    except Exception:
        return None
