# Stage 1: Frontend static build
FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Backend + frontend static files
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends --no-install-suggests \
    qpdf curl \
    libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress libreoffice-draw \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY --from=frontend /app/out/ ./static/
EXPOSE 8080
ENV PYTHONUNBUFFERED=1
HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/api/health || exit 1
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
