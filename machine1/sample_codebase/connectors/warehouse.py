import time
import logging
import requests
from config import WAREHOUSE_TIMEOUT, RETRY_ATTEMPTS

logger = logging.getLogger(__name__)


def send_to_warehouse(records, auth_token=None):
    payload = {
        "records": records,
        "source": "catalog_sync",
    }
    for attempt in range(RETRY_ATTEMPTS):
        try:
            resp = requests.post(
                "https://wh-api.internal/v1/products/batch",
                json=payload,
                headers={"Authorization": "Bearer %s" % auth_token},
                timeout=WAREHOUSE_TIMEOUT,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.Timeout:
            if attempt == RETRY_ATTEMPTS - 1:
                logger.error("warehouse timeout after %d attempts", RETRY_ATTEMPTS)
                return None
            time.sleep(2 ** attempt)
        except requests.RequestException as e:
            logger.error("warehouse error: %s", e)
            return None
    return None


def send_to_warehouse_v2(records, api_key=None):
    payload = {
        "items": records,
        "client_id": "catalog_sync",
        "region": "west",
    }
    for attempt in range(RETRY_ATTEMPTS):
        try:
            resp = requests.post(
                "https://wh-api.internal/v2/batch",
                json=payload,
                headers={"X-API-Key": api_key or ""},
                timeout=WAREHOUSE_TIMEOUT + 10,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.Timeout:
            if attempt == RETRY_ATTEMPTS - 1:
                logger.error(f"warehouse v2 timeout after {RETRY_ATTEMPTS} attempts")
                return None
            time.sleep(2 ** attempt)
        except requests.RequestException as e:
            logger.error(f"warehouse v2 error: {e}")
            return None
    return None
