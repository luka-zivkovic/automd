FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# ── Install dependencies ──
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/mcp/package.json packages/mcp/
RUN pnpm install --frozen-lockfile

# ── Build everything ──
FROM deps AS build
COPY . .
# Build shared library (server depends on it)
RUN pnpm --filter @automd/shared build
# Build server (TypeScript → JS)
RUN pnpm --filter @automd/server build
# Build frontend (Vite → static files)
# VITE_AUTOMD_SERVER left unset so frontend uses same-origin API
RUN pnpm exec vite build

# ── Production image ──
FROM base AS production
ARG AUTOMD_VERSION=dev
ENV NODE_ENV=production
ENV AUTOMD_VERSION=${AUTOMD_VERSION}

# Copy package manifests for pnpm install --prod
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/mcp/package.json packages/mcp/

RUN pnpm install --frozen-lockfile --prod

# Copy built shared library
COPY --from=build /app/packages/shared/dist packages/shared/dist

# Copy built server
COPY --from=build /app/packages/server/dist packages/server/dist

# Copy built frontend → placed at packages/server/dist/../../client
# The server resolves this as path.resolve(__dirname, '../../client')
# __dirname = /app/packages/server/dist → ../../client = /app/client
COPY --from=build /app/dist client

EXPOSE 4800
ENV AUTOMD_STORAGE_DIR=/data
ENV AUTOMD_PORT=4800

CMD ["node", "packages/server/dist/index.js"]
