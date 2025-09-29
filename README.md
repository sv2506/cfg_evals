# cfg_evals

Experimental NL → SQL (ClickHouse) pipeline using GPT-5 Context Free Grammar (CFG) constraints.

## Features

- FastAPI backend with two paths:
  - `POST /query` simple echo (baseline)
  - `POST /nl-query` natural language → constrained SQL → (mock) ClickHouse rows
- Constrained grammar (`app/grammars/clickhouse_sql.bnf`) limiting output to a safe SELECT subset
- Mock mode (default) – no real OpenAI or ClickHouse credentials required
- Deterministic heuristic fallback translation when API key absent
- Minimal React UI: toggle between Echo + CFG NL→SQL modes, view generated SQL + JSON rows
- Autocomplete (client): inline suggestion list while typing (Arrow / Tab / Enter) limited to top 5 matches from curated examples + session history
- Lightweight eval harness (`backend/evals/run_evals.py`) over 3+ test cases

## Directory Highlights

```
backend/
  app/
    main.py                 # FastAPI app + /nl-query
    config.py               # Settings + mock mode
    grammars/clickhouse_sql.bnf
    services/
      nl_to_sql.py          # NL → SQL (mock or OpenAI)
      clickhouse_client.py  # Mock data executor
  tests/
    test_nl_query.py
  evals/
    dataset.jsonl
    run_evals.py
client/
  src/pages/Query.tsx       # UI with mode toggle
```

## Environment Variables

| Variable              | Purpose                                                      | Default |
| --------------------- | ------------------------------------------------------------ | ------- |
| `OPENAI_API_KEY`      | Real GPT-5 access (optional in mock)                         | None    |
| `OPENAI_MODEL`        | Model name                                                   | `gpt-5` |
| `MOCK_MODE`           | Force mock path (`true/false`)                               | `true`  |
| `CLICKHOUSE_HOST`     | ClickHouse hostname (Docker: `localhost`)                    | None    |
| `CLICKHOUSE_PORT`     | HTTP port (native container default 8123)                    | None    |
| `CLICKHOUSE_DATABASE` | Database/schema name (e.g. `default`)                        | None    |
| `CLICKHOUSE_USER`     | Username (optional; often `default` locally)                 | None    |
| `CLICKHOUSE_PASSWORD` | Password (optional; set for secured/cloud instances)         | None    |
| `CLICKHOUSE_SECURE`   | `true` to enable TLS (ClickHouse Cloud / HTTPS)              | `false` |
| `CLICKHOUSE_CA_CERT`  | Path to CA certificate file (only if custom CA / enterprise) | None    |

Minimum for local non‑secure Docker: `CLICKHOUSE_HOST`, `CLICKHOUSE_PORT`, `CLICKHOUSE_DATABASE`, and `MOCK_MODE=false`.

For ClickHouse Cloud also set: `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_SECURE=true` (and optionally `CLICKHOUSE_CA_CERT`).

Set `MOCK_MODE=false` and provide `OPENAI_API_KEY` to exercise real grammar calls (parameter name `grammar` assumed; adjust when official SDK confirms interface).

## Grammar

Located at `backend/app/grammars/clickhouse_sql.bnf` – restricts to:

- `SELECT` only
- Aggregates: count, sum, avg, min, max
- Simple WHERE equality or BETWEEN time filters
- Optional GROUP BY, LIMIT
- Basic relative time pattern (prototype)

## Running Backend

### Option A: Mock Mode (no ClickHouse / no OpenAI key)

```
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export MOCK_MODE=true
uvicorn app.main:app --reload --port 8000
```

### Option B: Real ClickHouse (load provided CSV) + (optional) OpenAI

1. Start local ClickHouse via Docker:

```
docker run -d --name ch -p 8123:8123 -p 9000:9000 clickhouse/clickhouse-server:latest
```

2. Wait a few seconds for startup.
3. Create table (matches grammar expectations). Note: CSV header uses `subscription_plan` while earlier examples showed `subscription_plane` (typo). Use the schema below:

```
docker exec -i ch clickhouse-client --query "CREATE TABLE IF NOT EXISTS default.MOCK_DATA (\n  id UInt32,\n  name String,\n  email String,\n  age Int64,\n  signup_date DateTime,\n  country String,\n  is_active Bool,\n  subscription_plan String,\n  last_login DateTime,\n  balance Int64\n) ENGINE=MergeTree ORDER BY id;"
```

4. Load sample CSV (`sample_files/MOCK_DATA.csv`). This CSV contains realistic rows for development & testing.

```
docker exec -i ch bash -c "cat > /tmp/MOCK_DATA.csv" < sample_files/MOCK_DATA.csv
docker exec -i ch clickhouse-client --query "INSERT INTO default.MOCK_DATA FORMAT CSVWithNames" < sample_files/MOCK_DATA.csv
```

5. (Optional) Verify row count:

```
docker exec -it ch clickhouse-client --query "SELECT count() FROM default.MOCK_DATA"
```

6. Run backend pointing at ClickHouse:

```
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export CLICKHOUSE_HOST=localhost
export CLICKHOUSE_PORT=8123
export CLICKHOUSE_DATABASE=default
export MOCK_MODE=false
# Optional (only if you have model access): export OPENAI_API_KEY=sk-...; export OPENAI_MODEL=gpt-5
uvicorn app.main:app --reload --port 8000
```

Backend now serves:

- http://localhost:8000/health
- http://localhost:8000/nl-query

## Running Frontend

```
cd client
npm install
npm start
```

Open http://localhost:3000 and use the Query page.

The UI includes:

- Mode toggle (Echo vs NL→SQL)
- Generated SQL + results (when NL mode)
- Raw API response block
- Collapsible session Query History (button on right). Each history item can expand to show details and provides:
  - Run Again (auto executes immediately)
  - Load Only (populate textarea but keep cleared results)
  - Collapse

## API Examples (Mock Mode)

Example natural language queries mapped to `default.MOCK_DATA`:

| Natural Language                         | Example Generated SQL                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| "Count all users"                        | `SELECT count(*) FROM default.MOCK_DATA`                                                   |
| "Sum total balance in the last 30 hours" | `SELECT sum(balance) FROM default.MOCK_DATA WHERE signup_date >= subtractHours(now(), 30)` |
| "Find users whose name contains ali"     | `SELECT * FROM default.MOCK_DATA WHERE name ILIKE '%ali%'`                                 |

Example request:

```
curl -s -X POST localhost:8000/nl-query \
  -H 'Content-Type: application/json' \
  -d '{"question":"Sum total balance in the last 30 hours"}' | jq
```

Example response (mock):

```json
{
  "sql": "SELECT sum(balance) FROM default.MOCK_DATA WHERE signup_date >= subtractHours(now(), 30)",
  "rows": [{ "sum": 5200 }],
  "mocked": true,
  "warning": "Mock mode enabled: using heuristic translation + sample data"
}
```

## Evals

Dataset: `backend/evals/dataset.jsonl` (JSONL lines with regex expectations). Run:

```
cd backend
python -m evals.run_evals
```

Output JSON summary:

```json
{
  "summary": {"total": 3, "passed": 3, "failed": 0},
  "results": [ ... ]
}
```

Exit code non‑zero if any fail (CI friendly).

## Testing

```
cd backend
pytest -q
```

## Extending

- Add more grammar production rules for JOINs after auditing safety.
- Introduce caching layer for repeated NL queries.
- Add latency + token metrics collection.
- Persist evaluation history.

## Deployment Notes

### Docker (Backend)

Create image:

```
docker build -t cfg-evals-backend -f backend/Dockerfile .
```

Run (mock mode):

```
docker run -p 8000:8000 cfg-evals-backend
```

Run (real LLM + ClickHouse Cloud):

```
docker run -p 8000:8000 \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e OPENAI_MODEL=gpt-5 \
  -e MOCK_MODE=false \
  -e CLICKHOUSE_HOST=$CLICKHOUSE_HOST \
  -e CLICKHOUSE_PORT=$CLICKHOUSE_PORT \
  -e CLICKHOUSE_USER=$CLICKHOUSE_USER \
  -e CLICKHOUSE_PASSWORD=$CLICKHOUSE_PASSWORD \
  -e CLICKHOUSE_DATABASE=default \
  -e CLICKHOUSE_SECURE=true \
  cfg-evals-backend
```

### Compose

See `docker-compose.yml` for combined service configuration (after added).

### Production Guidance

- Run behind a reverse proxy with TLS termination.
- Set `temperature=1` for deterministic SQL.
- Log (NL query, generated SQL, latency) excluding PII.
- If model call fails, return 503; do not silently degrade to mock.
- Pin dependency versions (already in `requirements.txt`).
- Periodically re-run evals and diff SQL outputs.

### CSV Source Attribution

`sample_files/MOCK_DATA.csv` is synthetic demo data generated for this project (no real user information). Feel free to replace with your own dataset; update the grammar/table schema accordingly if you add columns.
