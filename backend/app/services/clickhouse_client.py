from __future__ import annotations
from typing import Any, List, Dict, Optional
from functools import lru_cache
from app.config import get_settings

SAMPLE_ROWS = [
    {"order_id": 1, "amount": 120.50, "created_at": "2025-09-27T10:00:00"},
    {"order_id": 2, "amount": 75.00, "created_at": "2025-09-27T18:30:00"},
    {"order_id": 3, "amount": 310.10, "created_at": "2025-09-28T02:15:00"},
]

@lru_cache
def _get_real_client():
    from clickhouse_connect import get_client  # local import to avoid dependency in mock mode
    settings = get_settings()
    if not (settings.clickhouse_host and settings.clickhouse_port and settings.clickhouse_database):
        raise RuntimeError("ClickHouse connection settings incomplete")
    kwargs = dict(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        username=settings.clickhouse_user or 'default',
        password=settings.clickhouse_password or '',
        database=settings.clickhouse_database,
    )
    # ClickHouse Cloud typically requires secure TLS
    if getattr(settings, 'clickhouse_secure', False):
        kwargs['secure'] = True
    if getattr(settings, 'clickhouse_ca_cert', None):
        kwargs['ca_cert'] = settings.clickhouse_ca_cert
    return get_client(**kwargs)


def _safety_check(sql: str) -> Optional[str]:
    l = sql.strip().lower()
    if not l.startswith("select"):
        return "Only SELECT statements allowed"
    if ";" in l:
        return "Semicolons not permitted"
    # Restrict to expected table reference
    if "mock_data" not in l:
        return "Query must reference MOCK_DATA"
    # Disallow system tables / dangerous keywords
    forbidden = ["insert", "alter", "drop", "truncate", "optimize", "attach", "detach", "rename", "grant", "revoke"]
    if any(f in l for f in forbidden):
        return "Disallowed keyword present"
    return None


def execute_sql(sql: str) -> List[Dict[str, Any]]:
    settings = get_settings()
    if settings.mock_mode:
        # Return filtered or aggregated mock results based on trivial patterns
        # NOTE: These sample rows still reflect legacy 'orders' shape; left for simple testing.
        l = sql.lower()
        if l.startswith("select count"):
            return [{"count": len(SAMPLE_ROWS)}]
        if l.startswith("select sum"):
            total = sum(r["amount"] for r in SAMPLE_ROWS)
            return [{"sum": round(total, 2)}]
        if l.startswith("select avg"):
            total = sum(r["amount"] for r in SAMPLE_ROWS)
            return [{"avg": round(total / len(SAMPLE_ROWS), 2)}]
        return SAMPLE_ROWS

    # Real execution path
    err = _safety_check(sql)
    if err:
        raise ValueError(f"Safety check failed: {err}")

    client = _get_real_client()
    result = client.query(sql)
    # Build list of dict rows
    return [dict(zip(result.column_names, row)) for row in result.result_rows]
