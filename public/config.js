/* ============================================================
   HealthCareOAB+ — runtime frontend config
   ------------------------------------------------------------
   Served verbatim from /public (NOT bundled by Vite), so a single built
   image can be retargeted at container start: docker-entrypoint.sh
   regenerates this file from the API_BASE env var. Loaded BEFORE api.js.

   Empty apiBase ⇒ api.js falls back to import.meta.env.VITE_API_BASE,
   then <meta name="hc-api-base">, then its localhost default.
   ============================================================ */
window.HC_CONFIG = { apiBase: '' };
