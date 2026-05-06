// ── Bug B6: Unhandled Promise Rejection ─────────────────────────────────────
// Async function throws without a catch, triggering unhandledRejection.
async function fetchData() {
  throw new Error('NetworkError: ECONNREFUSED 127.0.0.1:5432');
}

fetchData();
