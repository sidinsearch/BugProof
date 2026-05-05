// B5: Timeout — infinite loop that must be killed by BugProof's timeout
// Run with: bugproof capture --timeout 2000 -- node timeout-loop.js
console.error("Error: Application entered infinite loop");
while (true) {
  // Busy wait — will be killed by SIGKILL after timeout
}
