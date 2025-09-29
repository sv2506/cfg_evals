#!/usr/bin/env python
"""Bootstrap ClickHouse: create MOCK_DATA table & insert sample rows.

Usage:
  python scripts/init_clickhouse.py

Reads environment variables (same as backend):
  CLICKHOUSE_HOST (default localhost)
  CLICKHOUSE_PORT (default 8123)
  CLICKHOUSE_USER (default default)
  CLICKHOUSE_PASSWORD (default empty)
  CLICKHOUSE_DATABASE (default default)

Requires clickhouse-connect (already in requirements.txt)
"""
from __future__ import annotations
import os
import logging
from clickhouse_connect import get_client

HOST = os.getenv("CLICKHOUSE_HOST", "localhost")
PORT = int(os.getenv("CLICKHOUSE_PORT", "8123"))
USER = os.getenv("CLICKHOUSE_USER", "default")
PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "")
DATABASE = os.getenv("CLICKHOUSE_DATABASE", "default")

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS default.MOCK_DATA (
  id UInt32,
  name String,
  email String,
  age Int64,
  signup_date DateTime,
  country String,
  is_active Bool,
  subscription_plane String,
  last_login DateTime,
  balance Int64
) ENGINE = MergeTree ORDER BY id
"""

INSERT_SQL = """
INSERT INTO default.MOCK_DATA (id,name,email,age,signup_date,country,is_active,subscription_plane,last_login,balance) VALUES
  (1,'Alice','alice@example.com',34, now()-interval 10 day,'US',1,'basic',       now()-interval 1 hour,   500),
  (2,'Bob','bob@example.com',41,   now()-interval 20 day,'DE',0,'pro',         now()-interval 5 hour,  1250),
  (3,'Cara','cara@example.com',29,  now()-interval  2 day,'US',1,'enterprise',  now()-interval 30 minute,3000),
  (4,'Dan','dan@example.com',50,    now()-interval 40 day,'FR',1,'basic',       now()-interval 2 hour,   150),
  (5,'Eve','eve@example.com',22,    now()-interval  5 day,'IN',1,'pro',         now()-interval 15 minute,850)
"""

def main():
  logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
  )
  log = logging.getLogger("cfg_evals.init_clickhouse")
  client = get_client(host=HOST, port=PORT, username=USER, password=PASSWORD, database=DATABASE)
  client.command(SCHEMA_SQL)
  # Insert only if empty
  result = client.query("SELECT count() FROM default.MOCK_DATA")
  count = result.result_rows[0][0]
  if count == 0:
    client.command(INSERT_SQL)
    log.info("Inserted sample rows into default.MOCK_DATA")
  else:
    log.info(f"Table already has {count} rows; skipping insert")
  log.info("Bootstrap complete.")

if __name__ == "__main__":
    main()
