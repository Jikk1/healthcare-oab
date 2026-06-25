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

exec "$@"
