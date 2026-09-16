# The web app as a Node server for Cloud Run. Build from the repo root, so the workspace is there:
#   docker build -f apps/input-capture-web/Dockerfile -t input-capture-web .

# ---- build: all dependencies, then the SvelteKit build (adapter-node → apps/input-capture-web/build)
FROM node:24-slim AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/input-capture-web/package.json apps/input-capture-web/
COPY apps/input-pdf-worker/package.json apps/input-pdf-worker/
COPY packages/domain-data/package.json packages/domain-data/
COPY packages/bucket/package.json packages/bucket/
RUN npm ci --ignore-scripts

COPY packages/domain-data packages/domain-data
COPY packages/bucket packages/bucket
COPY apps/input-capture-web apps/input-capture-web
RUN npm run build -w @urban-moon/input-capture-web

# ---- runtime: the build output and the app's production dependencies only
FROM node:24-slim
WORKDIR /repo
ENV NODE_ENV=production \
    PORT=8080

COPY package.json package-lock.json ./
COPY apps/input-capture-web/package.json apps/input-capture-web/
COPY apps/input-pdf-worker/package.json apps/input-pdf-worker/
COPY packages/domain-data/package.json packages/domain-data/
COPY packages/bucket/package.json packages/bucket/
RUN npm ci --omit=dev --ignore-scripts -w @urban-moon/input-capture-web && npm cache clean --force

COPY --from=build /repo/apps/input-capture-web/build apps/input-capture-web/build

USER node
EXPOSE 8080
CMD ["node", "apps/input-capture-web/build"]
