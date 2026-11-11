# DiabetEasy API: one image, two entry points.
#   Web API (default):   docker run -p 8000:8000 --env-file .env diabeteasy-api
#   Weekly email job:    docker run --env-file .env diabeteasy-api python -m app.jobs.weekly_insights
#   One-time Base44 copy: docker run --env-file .env -v $PWD/export:/export diabeteasy-api \
#                          python -m app.jobs.migrate_base44 --source /export --dry-run
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN python -m compileall -q app \
    && useradd --create-home --uid 10001 appuser \
    && chown -R appuser /app
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/healthz')"
CMD ["sh", "start.sh"]
