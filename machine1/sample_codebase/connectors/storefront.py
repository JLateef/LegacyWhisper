import logging
import requests
from config import STOREFRONT_TIMEOUT

logger = logging.getLogger(__name__)


class StorefrontConflictError(Exception):
    pass


def push_to_storefront(record):
    payload = _build_payload(record)
    try:
        resp = requests.put(
            "https://storefront.internal/api/products/{}".format(record.get("sku")),
            json=payload,
            timeout=STOREFRONT_TIMEOUT,
        )
        if resp.status_code == 409:
            raise StorefrontConflictError(record.get("sku"))
        resp.raise_for_status()
        return resp.json()
    except StorefrontConflictError:
        pass
    except requests.RequestException as e:
        logger.error("storefront push failed for %s: %s", record.get("sku"), e)
        raise


def _build_payload(record):
    return {
        "sku": record.get("sku"),
        "title": record.get("title"),
        "price": record.get("price"),
        "description": record.get("description"),
        "inventory": record.get("inventory", 0),
        "active": record.get("active", True),
    }
