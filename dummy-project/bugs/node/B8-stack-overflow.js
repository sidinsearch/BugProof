// ── Bug B8: Stack Overflow ──────────────────────────────────────────────────
// Infinite recursion triggers RangeError: Maximum call stack size exceeded.
function recurse(n) {
  return recurse(n + 1);
}

recurse(0);
