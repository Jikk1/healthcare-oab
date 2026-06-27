# ============================================================
# HealthCareOAB+ frontend — Vite build served by rootless nginx
#   docker build -f frontend.Dockerfile -t healthcare-oab/web .
#   docker run -p 8081:8081 -e API_BASE=https://api.example healthcare-oab/web
# ============================================================

# ---- Stage 1: build the static bundle with Vite ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
RUN npm run build

# ---- Stage 2: serve the bundle ----
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Runs as uid 101 (nginx) by default. Switch to root only to lay down
# files and fix ownership, then drop back.
USER root

# Site config (listens on :8081, see nginx.conf).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Built bundle. /config.js (from public/) ships inside dist and is overwritten
# at container start by the entrypoint below.
COPY --from=build --chown=101:101 /app/dist/ /usr/share/nginx/html/

# Runtime config generator (writes config.js from $API_BASE, then execs nginx).
COPY docker-entrypoint.sh /docker-entrypoint.hc.sh
RUN chmod +x /docker-entrypoint.hc.sh \
    && chown 101:101 /usr/share/nginx/html

USER 101
EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8081/healthz >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/docker-entrypoint.hc.sh"]
CMD ["nginx", "-g", "daemon off;"]
