#!/bin/sh
# ============================================================
# Regenerate the runtime frontend config from the environment so a
# single immutable image can target any API origin. Runs before nginx.
# ============================================================
set -eu

API_BASE="${API_BASE:-}"

cat > /usr/share/nginx/html/config.js <<EOF
/* Generated at container start from \$API_BASE — do not edit. */
window.HC_CONFIG = { apiBase: "${API_BASE}" };
EOF

echo "[entrypoint] config.js apiBase=\"${API_BASE:-<empty>}\""

# ------------------------------------------------------------
# Render the CSP connect-src so the browser may only reach 'self' + the exact
# API the app talks to. Priority:
#   1) $CSP_CONNECT_SRC  — explicit override (e.g. several hosts, ws:// origin)
#   2) origin of $API_BASE — derived scheme://host[:port]
#   3) 'self'            — same-origin / dev (empty API_BASE)
# Written into the generated /etc/nginx/security-headers.conf from its template.
# ------------------------------------------------------------
if [ -n "${CSP_CONNECT_SRC:-}" ]; then
  CONNECT_SRC="$CSP_CONNECT_SRC"
elif [ -n "$API_BASE" ]; then
  API_ORIGIN=$(printf '%s' "$API_BASE" | sed -E 's#^([a-zA-Z][a-zA-Z0-9+.-]*://[^/]+).*#\1#')
  CONNECT_SRC="'self' ${API_ORIGIN}"
else
  CONNECT_SRC="'self'"
fi

# '#' delimiter — CONNECT_SRC contains '/' but never '#'.
sed "s#__CSP_CONNECT_SRC__#${CONNECT_SRC}#g" \
    /etc/nginx/security-headers.conf.template > /etc/nginx/security-headers.conf

echo "[entrypoint] CSP connect-src: ${CONNECT_SRC}"

exec "$@"
