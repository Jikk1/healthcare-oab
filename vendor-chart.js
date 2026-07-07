/* ============================================================
   HealthCareOAB+ — Chart.js as a global (window.Chart)
   ------------------------------------------------------------
   Bundled by Vite and exposed on window so the page's other scripts
   (charts.js / dashboard.js / predict.js / labs.js) can use Chart without
   an inline <script>. Keeping this in a real module file lets the CSP drop
   script-src 'unsafe-inline'. Must load BEFORE its consumers in the HTML.
   ============================================================ */
import Chart from 'chart.js/auto';

window.Chart = Chart;
