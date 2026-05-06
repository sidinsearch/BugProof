// ── Bug B1: Node.js SyntaxError ──────────────────────────────────────────────
// Missing closing parenthesis triggers a parse error before execution.
console.log("this line is fine");
const x = JSON.parse('{"broken": true'  // <-- missing closing bracket
console.log("never reached");
