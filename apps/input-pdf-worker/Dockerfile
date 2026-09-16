# The PDF worker for Cloud Run. Build from the repo root, so the workspace is there:
#   docker build -f apps/input-pdf-worker/Dockerfile -t input-pdf-worker .
# The build context is narrowed by Dockerfile.dockerignore next to this file.
#
# No build step: the worker and the workspace packages are TypeScript, run with tsx (a runtime
# dependency). The fonts are read from apps/input-pdf-worker/fonts at runtime.
FROM node:24-slim
WORKDIR /repo
ENV NODE_ENV=production \
    PORT=8080

COPY package.json package-lock.json ./
COPY apps/input-capture-web/package.json apps/input-capture-web/
COPY apps/input-pdf-worker/package.json apps/input-pdf-worker/
COPY packages/domain-data/package.json packages/domain-data/
COPY packages/bucket/package.json packages/bucket/
RUN npm ci --omit=dev --ignore-scripts -w @urban-moon/input-pdf-worker && npm cache clean --force

COPY packages/domain-data/src packages/domain-data/src
COPY packages/bucket/src packages/bucket/src
COPY apps/input-pdf-worker/fonts apps/input-pdf-worker/fonts
COPY apps/input-pdf-worker/src apps/input-pdf-worker/src

USER node
WORKDIR /repo/apps/input-pdf-worker
EXPOSE 8080
CMD ["node", "--import", "tsx", "src/main.ts"]
