import logging
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
from .config import get_settings
from .services.nl_to_sql import nl_to_sql, LLMQuotaExceeded
from .services.clickhouse_client import execute_sql

"""Auth endpoint removed: no authentication required now."""

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
logger = logging.getLogger("cfg_evals")

app = FastAPI(title="cfg_evals Backend", version="0.1.0")

# Allow local dev frontend (adjust origins as needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", summary="Health Check")
async def health():
    return {"status": "ok"}

@app.get("/")
async def root():
    return {"message": "Backend running"}


class QueryRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000, description="User submitted query text")
    metadata: Optional[dict] = Field(default=None, description="Optional metadata payload")


class QueryResponse(BaseModel):
    received: str
    length: int
    info: str


class NLQueryRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=500)


class NLQueryResponse(BaseModel):
    sql: str
    rows: list
    mocked: bool
    warning: Optional[str] = None


@app.post("/query", response_model=QueryResponse, summary="Submit a query and get echo response")
async def submit_query(payload: QueryRequest):
    """Echo the submitted text with simple derived info."""
    txt = payload.text.strip()
    return QueryResponse(
        received=txt,
        length=len(txt),
        info="Message received successfully",
    )


@app.post("/nl-query", response_model=NLQueryResponse, summary="Natural language to SQL using CFG + GPT-5")
async def natural_language_query(req: NLQueryRequest):
    settings = get_settings()
    logger.info("/nl-query received", extra={"question": req.question[:160]})
    try:
        sql, mocked_translation = nl_to_sql(req.question)
        logger.debug("Translation produced SQL", extra={"sql": sql})
    except LLMQuotaExceeded as qe:
        logger.warning("LLM quota exceeded", extra={"error": str(qe)})
        raise HTTPException(status_code=503, detail=f"LLM quota exceeded: {qe}")
    except Exception as e:
        logger.exception("Translation failed")
        raise HTTPException(status_code=500, detail=f"Translation failed: {e}")

    # Basic safety: prevent non-select
    if not sql.lower().strip().startswith("select"):
        raise HTTPException(status_code=400, detail="Generated SQL not allowed (must be SELECT)")

    try:
        rows = execute_sql(sql)
        logger.debug("SQL executed", extra={"row_count": len(rows) if isinstance(rows, list) else None})
    except Exception as e:
        logger.exception("Execution failed")
        raise HTTPException(status_code=500, detail=f"Execution failed: {e}")

    warn = None
    if settings.mock_mode:
        warn = "Mock mode enabled: using heuristic translation + sample data"

    logger.info("/nl-query success", extra={"mocked": settings.mock_mode or mocked_translation})
    return NLQueryResponse(sql=sql, rows=rows, mocked=settings.mock_mode or mocked_translation, warning=warn)
