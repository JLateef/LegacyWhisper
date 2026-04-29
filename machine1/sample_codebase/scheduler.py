import logging
from sync_engine import initialize, sync_products

logger = logging.getLogger(__name__)


def run_scheduled_sync(db_connection):
    initialize(db_connection)
    products = _fetch_pending(db_connection)
    if not products:
        return {"synced": 0, "failed": 0, "skipped": 0}
    return sync_products(products)


def run_full_sync(db_connection):
    initialize(db_connection)
    products = _fetch_all(db_connection)
    return sync_products(products, force_full=True)


def _fetch_pending(conn):
    rows = conn.execute(
        "SELECT * FROM products WHERE needs_sync = 1 ORDER BY updated_at"
    ).fetchall()
    return [dict(r) for r in rows]


def _fetch_all(conn):
    rows = conn.execute("SELECT * FROM products ORDER BY id").fetchall()
    return [dict(r) for r in rows]
