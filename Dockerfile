# ── Stage 1: Build React frontend ──────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /build
COPY render/web/package.json ./
RUN npm install
COPY render/web/ ./
RUN npm run build

# ── Stage 2: Python runtime ───────────────────────────────────
FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY main.py .
COPY config.json .
COPY data/ data/
COPY render/web/server.py render/web/server.py
COPY render/web/profiles.py render/web/profiles.py
COPY render/web/shared_rosters.py render/web/shared_rosters.py
COPY render/cli/ render/cli/

# Copy built frontend into render/web/dist/
COPY --from=frontend-build /build/dist render/web/dist/

# Bake git info — .git isn't copied into the image, so the deploy script
# passes these as build args (see deploy-war.sh).
ARG GIT_COMMIT=unknown
ARG GIT_TIMESTAMP=unknown
ENV GIT_COMMIT=${GIT_COMMIT}
ENV GIT_TIMESTAMP=${GIT_TIMESTAMP}
ENV PYTHONUNBUFFERED=1
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

CMD ["python", "-m", "uvicorn", "render.web.server:app_instance", \
     "--host", "0.0.0.0", "--port", "8001"]
