// B6: Multi-line Stderr — deep stack trace with 50+ lines
// Tests that fingerprinting works with large stderr output

function level(n) {
  if (n <= 0) {
    throw new Error("DeepStackError: maximum recursion depth exceeded in bugproof test fixture");
  }
  return level(n - 1);
}

try {
  level(40);
} catch (err) {
  // Print a long structured error to stderr
  console.error("=== APPLICATION CRASH REPORT ===");
  console.error(`Timestamp: ${new Date().toISOString()}`);
  console.error(`Process: node (PID ${process.pid})`);
  console.error(`Platform: ${process.platform} ${process.arch}`);
  console.error(`Node: ${process.version}`);
  console.error("");
  console.error("Unhandled Exception:");
  console.error(`  ${err.message}`);
  console.error("");
  console.error("Stack Trace:");
  const lines = err.stack.split('\n');
  for (const line of lines) {
    console.error(`  ${line}`);
  }
  console.error("");
  console.error("=== END CRASH REPORT ===");
  process.exit(1);
}
