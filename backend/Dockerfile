# ============================================================
# HealthCareOAB+ API — multi-stage, distroless-friendly image
# ============================================================

# ---- deps: install production node_modules ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

# ---- build: full deps + typecheck (fails fast on type errors) ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run typecheck

# ---- runtime ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080
# OpenSSL is required by Prisma engines.
RUN apt-get update && apt-get install -y --no-install-recommends openssl curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root runtime user.
RUN groupadd --gid 1001 nodeapp && useradd --uid 1001 --gid nodeapp --shell /bin/bash --create-home nodeapp

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY package.json ./
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json ./

USER nodeapp
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:8080/health/live || exit 1

# tsx is a production dependency so the TS entrypoint runs without a separate build artifact.
CMD ["node", "--import", "tsx/esm", "src/main.ts"]
