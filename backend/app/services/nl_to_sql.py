from __future__ import annotations
import logging
from pathlib import Path
from typing import Tuple
from app.config import get_settings

class LLMQuotaExceeded(Exception):
    """Raised when the upstream LLM returns an insufficient_quota / 429 error."""

INSTRUCTION = """You are a translator that converts natural language analytics requests into STRICT SQL matching the provided grammar.\nRules:\n1. Output ONLY SQL, no commentary.\n2. Prefer listing rows (SELECT *) when the user asks to 'find', 'list', 'show' entities.\n3. Use aggregates only when user explicitly asks for count/sum/avg/min/max.\n4. Preserve safe simplicity: avoid unnecessary columns.\nSQL:"""

def load_grammar_text(path: str) -> str:
    p = Path(path)
    return p.read_text(encoding="utf-8")

def mock_translate(nl: str) -> str:
    """Heuristic NL -> SQL for the MOCK_DATA table matching our restricted grammar.

    Supports a handful of analytic intents so the frontend + eval harness work
    without a real model. All outputs MUST conform to grammar constraints:
      - Only references table default.MOCK_DATA
      - Uses allowed aggregates / columns
    """
    q = nl.lower()

    # Count users
    if ("count" in q or "how many" in q) and ("user" in q or "record" in q or "rows" in q or "entries" in q):
        return "SELECT count(*) FROM default.MOCK_DATA"

    # Average age
    if ("average" in q or "avg" in q) and "age" in q:
        return "SELECT avg(age) FROM default.MOCK_DATA"

    # Sum / total balance
    if ("sum" in q or "total" in q) and ("balance" in q or "balances" in q):
        # Normalize time window phrases to ClickHouse syntax using subtractHours/Days(now())
        import re
        # Match 'last N hours' or 'last N days'
        m = re.search(r"last\s+(\d{1,3})\s+(hour|hours|day|days)", q)
        if m:
            n = m.group(1)
            unit = m.group(2)
            if 'hour' in unit:
                return f"SELECT sum(balance) FROM default.MOCK_DATA WHERE signup_date >= subtractHours(now(), {n})"
            else:
                return f"SELECT sum(balance) FROM default.MOCK_DATA WHERE signup_date >= subtractDays(now(), {n})"
        return "SELECT sum(balance) FROM default.MOCK_DATA"

    # Active users count
    if ("active" in q and ("users" in q or "user" in q)) or "active user" in q:
        return "SELECT count(*) FROM default.MOCK_DATA WHERE is_active = true"

    # Group by country counts
    if ("count" in q or "number" in q) and "country" in q and ("per" in q or "by" in q):
        return "SELECT country, count(*) AS cnt FROM default.MOCK_DATA GROUP BY country ORDER BY cnt DESC"

    # Pattern-related heuristics
    import re

    # Name starts with letter pattern
    m = re.search(r"name\s+(starts|starting|begins)\s+with\s+([a-z])", q)
    if m:
        letter = m.group(2).upper()
        limit_m = re.search(r"(first|top|show)\s+(\d{1,3})\s+(users|user|rows|records)", q)
        if limit_m:
            n = limit_m.group(2)
            return f"SELECT * FROM default.MOCK_DATA WHERE name ILIKE '{letter}%' LIMIT {n}"
        return f"SELECT * FROM default.MOCK_DATA WHERE name ILIKE '{letter}%'"

    # Name contains substring
    m = re.search(r"name\s+contains\s+([a-z0-9]+)", q)
    if m:
        part = m.group(1)
        limit_m = re.search(r"(first|top|show)\s+(\d{1,3})\s+(users|user|rows|records)", q)
        if limit_m:
            n = limit_m.group(2)
            return f"SELECT * FROM default.MOCK_DATA WHERE name ILIKE '%{part}%' LIMIT {n}"
        return f"SELECT * FROM default.MOCK_DATA WHERE name ILIKE '%{part}%'"

    # Name ends with letter(s)
    m = re.search(r"name\s+ends\s+with\s+([a-z]+)", q)
    if m:
        suffix = m.group(1)
        limit_m = re.search(r"(first|top|show)\s+(\d{1,3})\s+(users|user|rows|records)", q)
        if limit_m:
            n = limit_m.group(2)
            return f"SELECT * FROM default.MOCK_DATA WHERE name ILIKE '%{suffix}' LIMIT {n}"
        return f"SELECT * FROM default.MOCK_DATA WHERE name ILIKE '%{suffix}'"

    # Users from a specific country (phrases: users from US / users in US / country = US)
    m = re.search(r"(users|user).*\b(from|in)\s+([a-z]{2})\b", q)
    if m:
        country = m.group(3).upper()
        return f"SELECT * FROM default.MOCK_DATA WHERE country = '{country}'"

    # Filter by subscription plan
    # Subscription plan words often appear like: subscription plan pro / plan is pro / plan = pro
    m = re.search(r"(subscription\s+plan|plan)(\s+(is|=))?\s+([a-z]+)", q)
    if m:
        plan = m.group(4)
        return f"SELECT * FROM default.MOCK_DATA WHERE subscription_plane = '{plan}'"

    # Email domain queries: emails with domain gmail.com
    m = re.search(r"email(s)?\s+(with|having)?\s*domain\s+([a-z0-9\.-]+)", q)
    if m:
        domain = m.group(3)
        return f"SELECT * FROM default.MOCK_DATA WHERE email ILIKE '%@{domain}'"

    # LIMIT detection (show first 10 users)
    m = re.search(r"(first|top|show)\s+(\d{1,3})\s+(users|user|rows|records)", q)
    if m:
        n = m.group(2)
        # Basic list projection with LIMIT
        return f"SELECT * FROM default.MOCK_DATA LIMIT {n}"

    # Recent signups (default to last 7 days)
    if ("recent" in q or "last week" in q) and ("signup" in q or "sign ups" in q or "signups" in q):
        return "SELECT count(*) FROM default.MOCK_DATA WHERE signup_date >= subtractDays(now(), 7)"

    # Average balance by subscription plan
    if ("average" in q or "avg" in q) and ("balance" in q) and ("plan" in q or "subscription" in q):
        return "SELECT subscription_plane, avg(balance) AS avg_balance FROM default.MOCK_DATA GROUP BY subscription_plane ORDER BY avg_balance DESC"

    # Fallback
    return "SELECT count(*) FROM default.MOCK_DATA"

def nl_to_sql(nl_query: str) -> Tuple[str, bool]:
    settings = get_settings()
    grammar = load_grammar_text(settings.grammar_path)

    # Mock mode or missing API key => fallback
    if settings.mock_mode or not settings.openai_api_key:
        return mock_translate(nl_query), True

    logger = logging.getLogger("cfg_evals.nl_to_sql")
    logger.debug("Attempting LLM translation", extra={"query_preview": nl_query[:120]})

    # Real call (updated) - emulate grammar constraints via prompt since API does not support direct 'grammar' param.
    try:
        from openai import OpenAI  # lazy import; adjust if different package name
        client = OpenAI(api_key=settings.openai_api_key)
        # Embed a truncated grammar segment (to keep token usage low) for model guidance.
        truncated_grammar = '\n'.join(
            line for line in grammar.splitlines() if line.strip() and not line.strip().startswith('#')
        )[:2000]
        system_msg = (
            INSTRUCTION
            + "\nYou MUST conform to this restricted SQL grammar (subset shown):\n" + truncated_grammar
            + "\nConstraints: only SELECT, table default.MOCK_DATA, no other tables, no DDL, no JOIN."
        )

        def validate_sql(candidate: str) -> str:
            c = candidate.strip().rstrip(';')
            lc = c.lower()
            if not lc.startswith('select '):
                raise ValueError('Not a SELECT')
            if 'mock_data' not in lc:
                raise ValueError('Missing table reference')
            forbidden = [' insert ', ' update ', ' delete ', ' drop ', ' alter ', ' truncate ', ' optimize ']
            if any(f in (' ' + lc + ' ') for f in forbidden):
                raise ValueError('Disallowed keyword detected')
            return c

        logger.debug(
            "Dispatching LLM request", extra={"system_len": len(system_msg), "query_len": len(nl_query)}
        )

        chat = client.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "system", "content": system_msg}, {"role": "user", "content": nl_query}],
            temperature=1,
            max_completion_tokens=1024,
            response_format={"type": "text"},
        )
        sql = chat.choices[0].message.content or ""
        try:
            sql_validated = validate_sql(sql)
            return sql_validated, False
        except Exception as ve:
            logger.warning("Validation failed; raising for outer handler", extra={"error": str(ve)})
            raise
    except Exception as e:
        # Inspect for quota error signature
        msg = str(e)
        if 'insufficient_quota' in msg or 'You exceeded your current quota' in msg or '429' in msg:
            raise LLMQuotaExceeded(msg)
        logger.exception("LLM path failed; falling back to heuristic", extra={"error": msg})
        return mock_translate(nl_query), True
