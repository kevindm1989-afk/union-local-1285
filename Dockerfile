FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@10

# Copy workspace manifests first for better layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./

# Copy every package.json the workspace needs before install
COPY lib/db/package.json ./lib/db/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/object-storage-web/package.json ./lib/object-storage-web/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/pwa-app/package.json ./artifacts/pwa-app/
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/
COPY scripts/package.json ./scripts/

RUN pnpm install --frozen-lockfile

# Copy all source code
COPY . .

# 1. Generate typed API client from OpenAPI spec
RUN pnpm --filter @workspace/api-spec run codegen

# 2. Bundle the API server with esbuild
RUN pnpm --filter @workspace/api-server run build

# 3. Build the React PWA (PORT + BASE_PATH required by vite.config.ts)
ENV PORT=8080
ENV BASE_PATH=/
RUN pnpm --filter @workspace/pwa-app run build


# ── Production image ───────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# The esbuild bundle is self-contained — no node_modules needed
COPY --from=builder /app/artifacts/api-server/dist ./dist

# PWA static files served by Express at runtime
COPY --from=builder /app/artifacts/pwa-app/dist/public ./public

EXPOSE 8080

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
