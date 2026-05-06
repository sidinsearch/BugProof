// ── Bug B5: Timeout / Infinite Loop ─────────────────────────────────────────
// Spins forever, testing BugProof's --timeout handling.
process.stderr.write('TimeoutError: operation exceeded deadline\n');
const start = Date.now();
while (Date.now() - start < 60000) {
  // burn CPU for 60s — BugProof should kill this via --timeout
  Math.random();
}
