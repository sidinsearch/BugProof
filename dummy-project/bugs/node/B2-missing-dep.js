// ── Bug B2: Missing Dependency ───────────────────────────────────────────────
// Requires a module that is NOT installed (no node_modules).
const chalk = require('chalk');
console.log(chalk.green('hello'));
