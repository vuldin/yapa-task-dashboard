# Task dashboard image: the API server plus the built SPA, one origin.
#   docker build -t yapa-task-dashboard .
# The base comes from Google's Docker Hub mirror (reliable from Cloud Build);
# override NODE_IMAGE to pin a digest.
ARG NODE_IMAGE=mirror.gcr.io/library/node:22-bookworm-slim

# ---- build: typecheck, SPA bundle, server bundle ----------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm run build:server

# ---- deps: production dependencies only -------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

# ---- runtime ----------------------------------------------------------------
FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY --from=deps --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/dist ./dist
COPY --from=build --chown=root:root /app/web/dist ./web/dist
COPY --chown=root:root package.json ./package.json
# Files stay root-owned and read-only for the runtime user.
USER node
EXPOSE 8080
CMD ["node", "dist/server/index.js"]
