# ============================================================
# HealthCareOAB+ frontend — static nginx image (rootless)
#   docker build -f frontend.Dockerfile -t healthcare-oab/web .
#   docker run -p 8081:8081 -e API_BASE=https://api.example healthcare-oab/web
# ============================================================
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Runs as uid 101 (nginx) by default. Switch to root only to lay down
# files and fix ownership, then drop back.
USER root

# Site config (listens on :8081, see nginx.conf).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static assets. The backend/ tree and tooling are excluded via .dockerignore.
COPY --chown=101:101 index.html dashboard.html predict.html login.html /usr/share/nginx/html/
COPY --chown=101:101 *.js *.css /usr/share/nginx/html/
COPY --chown=101:101 vendor/ /usr/share/nginx/html/vendor/

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
