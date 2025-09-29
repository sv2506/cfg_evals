# Backend Dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System deps (if any minimal build tools needed later, can add)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/evals ./evals
COPY backend/scripts ./scripts

EXPOSE 8000

ENV MOCK_MODE=true

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
