from __future__ import annotations
from typing import Any, List, Dict, Optional
from functools import lru_cache
from app.config import get_settings

SAMPLE_ROWS = [
    {"id": 1, "name": "Alice Chen", "email": "alice@example.com", "age": 31, "country": "US", "is_active": True, "subscription_plan": "pro", "balance": 120},
    {"id": 2, "name": "Bruno Silva", "email": "bruno@example.com", "age": 27, "country": "BR", "is_active": True, "subscription_plan": "team", "balance": 75},
    {"id": 3, "name": "Chandra Rao", "email": "chandra@example.com", "age": 38, "country": "IN", "is_active": False, "subscription_plan": "free", "balance": 310},
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
        # Return representative data without requiring external services.
        l = sql.lower()
        if "group by country" in l:
            return [{"country": country, "cnt": sum(row["country"] == country for row in SAMPLE_ROWS)} for country in sorted({row["country"] for row in SAMPLE_ROWS})]
        if l.startswith("select count"):
            if "where is_active = true" in l:
                return [{"count": sum(row["is_active"] for row in SAMPLE_ROWS)}]
            return [{"count": len(SAMPLE_ROWS)}]
        if l.startswith("select sum"):
            total = sum(r["balance"] for r in SAMPLE_ROWS)
            return [{"sum": round(total, 2)}]
        if l.startswith("select avg"):
            if "age" in l:
                return [{"avg": round(sum(r["age"] for r in SAMPLE_ROWS) / len(SAMPLE_ROWS), 2)}]
            return [{"avg": round(sum(r["balance"] for r in SAMPLE_ROWS) / len(SAMPLE_ROWS), 2)}]
        if "subscription_plan = 'pro'" in l:
            return [row for row in SAMPLE_ROWS if row["subscription_plan"] == "pro"]
        if "country = 'us'" in l:
            return [row for row in SAMPLE_ROWS if row["country"] == "US"]
        return SAMPLE_ROWS

    # Real execution path
    err = _safety_check(sql)
    if err:
        raise ValueError(f"Safety check failed: {err}")

    client = _get_real_client()
    result = client.query(sql)
    # Build list of dict rows
    return [dict(zip(result.column_names, row)) for row in result.result_rows]
