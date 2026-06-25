/* ============================================================
   HealthCareOAB+ — runtime frontend config
   ------------------------------------------------------------
   Loaded BEFORE api.js. In containers this file is regenerated at
   startup from the API_BASE env var (see docker-entrypoint.sh), so a
   single static image can target any environment without a rebuild.

   Empty apiBase ⇒ api.js falls back to <meta name="hc-api-base"> or
   its localhost default, preserving the offline/file:// dev workflow.
   ============================================================ */
window.HC_CONFIG = { apiBase: '' };
