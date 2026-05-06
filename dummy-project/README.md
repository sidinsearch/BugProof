# BugProof Dummy Project

A multi-language test project with intentional bugs for validating BugProof's
cross-platform capture and replay pipeline.

## Bug Matrix

### Node.js Bugs (`bugs/node/`)

| ID | File | Error Type | Description |
|----|------|-----------|-------------|
| B1 | `B1-syntax-error.js` | SyntaxError | Malformed JSON parse |
| B2 | `B2-missing-dep.js` | MODULE_NOT_FOUND | Missing `chalk` package |
| B3 | `B3-missing-env.js` | Error | Missing DATABASE_URL env var |
| B4 | `B4-permission-error.js` | EPERM/EACCES | Write to read-only file |
| B5 | `B5-timeout.js` | Timeout | Infinite CPU loop |
| B6 | `B6-unhandled-rejection.js` | UnhandledRejection | Async throw without catch |
| B7 | `B7-type-error.js` | TypeError | Null dereference |
| B8 | `B8-stack-overflow.js` | RangeError | Infinite recursion |

### Python Bugs (`bugs/python/`)

| ID | File | Error Type | Description |
|----|------|-----------|-------------|
| P1 | `P1-syntax-error.py` | SyntaxError | Missing closing paren |
| P2 | `P2-import-error.py` | ModuleNotFoundError | Missing module |
| P3 | `P3-type-error.py` | TypeError | String + int |
| P4 | `P4-key-error.py` | KeyError | Missing dict key |
| P5 | `P5-zero-division.py` | ZeroDivisionError | Division by zero |
| P6 | `P6-recursion-error.py` | RecursionError | Infinite recursion |

## Usage

```bash
# Capture any bug
bugproof capture -- node bugs/node/B1-syntax-error.js
bugproof capture -- python bugs/python/P1-syntax-error.py

# Replay an artifact
bugproof replay bug_*.bug

# Inspect an artifact
bugproof inspect bug_*.bug
```
