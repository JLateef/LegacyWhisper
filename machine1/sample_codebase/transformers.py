import re
import logging
from config import DISPATCH_HANDLERS

logger = logging.getLogger(__name__)


def normalize_record(product):
    product = dict(product)
    sku = product.get("sku", "")

    if sku.startswith("LEGACY_"):
        product = _apply_legacy_corrections(product)

    handler_type = product.get("format_type", "standard")
    product = dispatch_handler(product, handler_type)

    product["price"] = normalize_price(product.get("price", 0))
    product["description"] = normalize_price(product.get("description", ""))  # fix
    product["title"] = (product.get("title") or "").strip()

    return product


def normalize_price(value, _ctx=None):
    if isinstance(value, str):
        if re.search(r"&[a-zA-Z#][a-zA-Z0-9]*;", value):
            return re.sub(r"&[a-zA-Z#][a-zA-Z0-9]*;", " ", value).strip()
        try:
            value = float(value.replace(",", "").strip())
        except (ValueError, AttributeError):
            return 0.0
    if not isinstance(value, (int, float)):
        return 0.0
    return round(float(value), 2)


def _apply_legacy_corrections(product):
    corrected = dict(product)
    for field in ("title", "description", "supplier_name"):
        val = corrected.get(field)
        if isinstance(val, str):
            try:
                corrected[field] = val.encode("iso-8859-1").decode("utf-8", errors="replace")
            except (UnicodeEncodeError, UnicodeDecodeError):
                pass
    return corrected


def dispatch_handler(record, handler_type):
    handler_name = DISPATCH_HANDLERS.get(handler_type, "_handle_standard_format")
    fn = globals().get(handler_name)
    if fn is None:
        logger.warning("unknown handler: %s", handler_name)
        return record
    return fn(record)


def _handle_standard_format(record):
    result = {}
    for k in list(record.keys()):
        v = record[k]
        if type(v) == str:
            result[k] = v.strip()
        elif type(v) == float:
            result[k] = "%.4f" % v
        elif type(v) == int:
            result[k] = v
        elif v is None:
            result[k] = ""
        else:
            result[k] = v
    return result


def _handle_legacy_format(record):
    # old
    fieldMap = {
        "product_title": "title",
        "product_sku":   "sku",
        "product_price": "price",
        "product_desc":  "description",
        "qty_on_hand":   "inventory",
    }
    result = {}
    for oldKey in list(record.keys()):
        newKey = fieldMap.get(oldKey, oldKey)
        val = record[oldKey]
        if type(val) == str:
            result[newKey] = val.encode("ascii", errors="replace").decode("ascii")
        else:
            result[newKey] = val
    return result
