// B3: Missing Environment Variable
// Expects REQUIRED_API_KEY to be set — it never is during E2E tests
if (!process.env.REQUIRED_API_KEY) {
  console.error("Error: Missing REQUIRED_API_KEY environment variable");
  console.error("Please set REQUIRED_API_KEY before running this application.");
  process.exit(1);
}
console.log("This line should never be reached");
