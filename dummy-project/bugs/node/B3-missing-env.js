// ── Bug B3: Missing Environment Variable ────────────────────────────────────
// Expects DATABASE_URL to be set; crashes with a clear message if missing.
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error('FATAL: DATABASE_URL environment variable is not set');
}
console.log('Connecting to', dbUrl);
