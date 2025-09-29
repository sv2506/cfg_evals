# Backend (FastAPI + CFG NL→SQL Demo)

Provides:

1. Health + root endpoints
2. `/query` echo endpoint
3. `/nl-query` natural language → constrained SQL (ClickHouse) via a hand-written grammar and optional model (mock by default)

## Endpoints

| Method | Path      | Description                                        |
| ------ | --------- | -------------------------------------------------- |
| GET    | /health   | Liveness check                                     |
| GET    | /         | Simple root message                                |
| POST   | /query    | Echoes submitted text                              |
| POST   | /nl-query | NL → SQL using grammar + (mock or model) + execute |

## Grammar-Constrained SQL

`app/grammars/clickhouse_sql.bnf` restricts output to safe, read‑only SELECT queries over `default.MOCK_DATA` with:

- Whitelisted columns & aggregates (count,sum,avg,min,max)
- Simple arithmetic on numeric fields, CASE, limited date truncation (toHour,toDay,toDate)
- WHERE with comparisons, IN lists, BETWEEN, relative time windows normalized to ClickHouse functions (e.g. `signup_date >= subtractHours(now(), 30)`, `signup_date >= subtractDays(now(), 7)`)
- GROUP BY / HAVING / ORDER BY / LIMIT

## Mock vs Real Mode

Environment variable `MOCK_MODE` (default `true`). In mock mode:

- NL→SQL uses deterministic heuristics (`mock_translate`)
- Execution returns synthetic rows / simple aggregates

Set `MOCK_MODE=false` to enable real model + ClickHouse (requires configuration below).

## ClickHouse Integration

When not in mock mode the backend uses `clickhouse-connect` to run generated queries after safety checks.

Environment variables:

| Variable              | Required (local) | Required (cloud) | Description                                                      | Example / Default |
| --------------------- | ---------------- | ---------------- | ---------------------------------------------------------------- | ----------------- |
| `MOCK_MODE`           | yes (set false)  | yes (set false)  | Disable mock path to execute real ClickHouse queries             | `false`           |
| `CLICKHOUSE_HOST`     | yes              | yes              | Hostname / endpoint (cloud: service hostname)                    | `localhost`       |
| `CLICKHOUSE_PORT`     | yes              | yes              | HTTP port (cloud often 8443; local default 8123)                 | `8123`            |
| `CLICKHOUSE_DATABASE` | yes              | yes              | Target database/schema                                           | `default`         |
| `CLICKHOUSE_USER`     | no (defaults)    | yes              | Username (cloud requires explicit user)                          | `default`         |
| `CLICKHOUSE_PASSWORD` | no               | yes              | Password / token for user                                        | (empty)           |
| `CLICKHOUSE_SECURE`   | no               | yes              | Enable TLS (HTTPS)                                               | `false`           |
| `CLICKHOUSE_CA_CERT`  | no               | optional         | Path to custom CA bundle (only if provider not publicly trusted) | None              |

Minimal local Docker example:

```
export MOCK_MODE=false
export CLICKHOUSE_HOST=localhost
export CLICKHOUSE_PORT=8123
export CLICKHOUSE_DATABASE=default
```

Cloud example adds:

```
export CLICKHOUSE_USER=my_user
export CLICKHOUSE_PASSWORD='secret'
export CLICKHOUSE_SECURE=true
```

### Example Table Schema (MOCK_DATA)

Create a demo table matching grammar expectations:

```sql
CREATE TABLE IF NOT EXISTS default.MOCK_DATA (
	id UInt32,
	name String,
	email String,
	age Int64,
	signup_date DateTime,
	country String,
	is_active Bool,
	subscription_plan String,
	last_login DateTime,
	balance Int64
) ENGINE = MergeTree ORDER BY id;
```

Insert a few sample rows:

```sql
INSERT INTO default.MOCK_DATA FORMAT Values
(1,'Alice','alice@example.com',34, now()-interval 10 day,'US',1,'basic', now()-interval 1 hour, 500),
(2,'Bob','bob@example.com',41,  now()-interval 20 day,'DE',0,'pro',   now()-interval 5 hour, 1250),
(3,'Cara','cara@example.com',29, now()-interval  2 day,'US',1,'enterprise', now()-interval 30 minute, 3000);

### Load Provided CSV (Recommended)

Instead of manual inserts, you can bulk load the synthetic data file shipped with the repo:

```

# From project root ensure container is running (see earlier docker run command)

docker exec -i ch clickhouse-client --query "TRUNCATE TABLE default.MOCK_DATA" || true
docker exec -i ch clickhouse-client --query "SELECT count() AS before_count FROM default.MOCK_DATA"

# Load CSV (with header) located at sample_files/MOCK_DATA.csv

docker exec -i ch clickhouse-client --query "INSERT INTO default.MOCK_DATA FORMAT CSVWithNames" < ../../sample_files/MOCK_DATA.csv

docker exec -i ch clickhouse-client --query "SELECT count() AS after_count FROM default.MOCK_DATA"

```

If your shell path differs, adjust the relative path to `sample_files/MOCK_DATA.csv` accordingly.
```

### Run a Local ClickHouse (Docker)

```bash
docker run -d --name ch -p 8123:8123 -p 9000:9000 clickhouse/clickhouse-server:latest
```

Then apply the schema + inserts (e.g. via `clickhouse-client` or HTTP):

```bash
docker exec -it ch clickhouse-client --query "<PASTE SQL HERE>"
```

## OpenAI Model (Optional)

If you have access to a model supporting CFG grammar parameter, set:

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5
MOCK_MODE=false
```

If no key is present or `MOCK_MODE=true`, the heuristic path is used.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run Dev Server

```bash
uvicorn app.main:app --reload --port 8000
```

Visit: http://localhost:8000/docs for interactive API.

## Running Tests

```bash
pytest -q
```

## Quick Local End-to-End (Real ClickHouse)

```bash
# 1. Start ClickHouse (Docker)
docker run -d --name ch -p 8123:8123 -p 9000:9000 clickhouse/clickhouse-server:latest

# 2. Wait a few seconds
sleep 5

# 3. (In backend directory) create venv & install deps
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 4. Export env vars (adjust if needed)
export CLICKHOUSE_HOST=localhost
export CLICKHOUSE_PORT=8123
export CLICKHOUSE_DATABASE=default
export MOCK_MODE=false

# 5. Bootstrap table & sample data
python scripts/init_clickhouse.py

# 6. Run the API
uvicorn app.main:app --reload --port 8000
```

Test an NL query (new terminal):

```bash
curl -s -X POST http://localhost:8000/nl-query \
	-H 'Content-Type: application/json' \
	-d '{"question":"Count all users"}' | jq
```

Expect JSON containing generated SQL referencing `MOCK_DATA` and a count result.

## ClickHouse Cloud

For ClickHouse Cloud services (TLS + password auth):

1. In the Cloud console, open your service and locate:
   - HTTPS endpoint (e.g. `abc123.us-east-1.aws.clickhouse.cloud`)
   - Port (often 8443 for HTTPS API) – if provided; otherwise use 443 or the documented HTTPS port
   - Username & password (create a SQL user if needed)
   - Database name (often `default` unless customized)
2. Export environment variables (example):

```bash
export CLICKHOUSE_HOST=abc123.us-east-1.aws.clickhouse.cloud
export CLICKHOUSE_PORT=8443          # or the HTTPS port shown
export CLICKHOUSE_USER=my_user
export CLICKHOUSE_PASSWORD='my_strong_password'
export CLICKHOUSE_DATABASE=default
export CLICKHOUSE_SECURE=true        # enables TLS
export MOCK_MODE=false
```

3. (Optional) If a custom CA bundle is required, download it and:

```bash
export CLICKHOUSE_CA_CERT=/path/to/ca.pem
```

4. Start the backend:

```bash
uvicorn app.main:app --reload --port 8000
```

5. Test connectivity:

```bash
curl -s -X POST http://localhost:8000/nl-query \
	-H 'Content-Type: application/json' \
	-d '{"question":"Count all users"}' | jq
```

If you see an auth error, verify username/password. If you see SSL issues, ensure `CLICKHOUSE_SECURE=true` and (if necessary) set `CLICKHOUSE_CA_CERT`.

## Evaluation Harness

`evals/dataset.jsonl` with simple expectations. Run (from inside the `backend` directory):

```bash
python -m evals.run_evals
```

Prerequisites:

- Either export `MOCK_MODE=true` (heuristic rows returned) OR set real ClickHouse env vars (`CLICKHOUSE_HOST`, `CLICKHOUSE_PORT`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DATABASE`, optionally `CLICKHOUSE_SECURE=true`).
- Without one of these configurations you'll see: `Execution failed: ClickHouse connection settings incomplete`.

Outputs JSON summary of pass/fail counts.

### Pattern + LIMIT Examples (LLM Guidance)

The grammar supports safe LIKE/ILIKE patterns plus LIMIT. Recommended mappings:

| Natural Language                        | SQL Sketch                                                         |
| --------------------------------------- | ------------------------------------------------------------------ |
| first 10 users whose name starts with a | `SELECT * FROM default.MOCK_DATA WHERE name ILIKE 'A%' LIMIT 10`   |
| show 5 users where name contains ali    | `SELECT * FROM default.MOCK_DATA WHERE name ILIKE '%ali%' LIMIT 5` |
| list users whose name ends with son     | `SELECT * FROM default.MOCK_DATA WHERE name ILIKE '%son'`          |

Guidance: At most one leading and/or trailing %; avoid multiple internal wildcards.

## Safety Notes

Additional runtime safety check guards non-SELECT and disallowed keywords before executing against ClickHouse. Grammar further constrains surface area.
