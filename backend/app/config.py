import os
from functools import lru_cache
from pydantic import BaseModel, Field

class Settings(BaseModel):
    openai_api_key: str | None = Field(default=None)
    openai_model: str = Field(default="gpt-5")
    grammar_path: str = Field(default="app/grammars/clickhouse_sql.bnf")
    mock_mode: bool = Field(default=True, description="If true, skip real OpenAI + ClickHouse calls")
    clickhouse_host: str | None = None
    clickhouse_port: int | None = None
    clickhouse_user: str | None = None
    clickhouse_password: str | None = None
    clickhouse_database: str | None = None
    clickhouse_secure: bool = Field(default=False, description="Use TLS (ClickHouse Cloud)")
    clickhouse_ca_cert: str | None = Field(default=None, description="Optional path to CA cert for ClickHouse Cloud")

@lru_cache
def get_settings() -> Settings:
    return Settings(
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-5"),
        mock_mode=os.getenv("MOCK_MODE", "true").lower() in {"1", "true", "yes"},
        clickhouse_host=os.getenv("CLICKHOUSE_HOST"),
        clickhouse_port=int(os.getenv("CLICKHOUSE_PORT", "0")) or None,
        clickhouse_user=os.getenv("CLICKHOUSE_USER"),
        clickhouse_password=os.getenv("CLICKHOUSE_PASSWORD"),
        clickhouse_database=os.getenv("CLICKHOUSE_DATABASE"),
    clickhouse_secure=os.getenv("CLICKHOUSE_SECURE", "false").lower() in {"1", "true", "yes"},
    clickhouse_ca_cert=os.getenv("CLICKHOUSE_CA_CERT"),
    )
