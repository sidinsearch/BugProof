# BugProof Examples

Four self-contained demos that show off capture / replay across languages.
Each example has its own folder with:

- A failing program
- Reproduction steps you can copy-paste
- A short `WALKTHROUGH.md` that explains what's interesting about it

| # | Example | Demonstrates |
|---|---|---|
| 1 | [`01-node-missing-module/`](./01-node-missing-module/) | A Node.js script crashing on a missing dependency — shows **`--self-heal`** in action |
| 2 | [`02-python-timeout/`](./02-python-timeout/) | A Python script that hangs — shows **`--timeout`** and timeout-aware fingerprints |
| 3 | [`03-go-test-failure/`](./03-go-test-failure/) | A Go test that fails — shows multi-language detection and stacktrace-mode source strategy |
| 4 | [`04-java-classnotfound/`](./04-java-classnotfound/) | A Java program with a `ClassNotFoundException` — shows JVM error pattern matching |

## How to run them

Every example uses the same three-step flow:

```bash
cd examples/<example-name>

# 1. Confirm it fails locally
./reproduce.sh        # or  reproduce.cmd  on Windows

# 2. Capture the failure into a .bug artifact
bugproof capture -n demo -- ./reproduce.sh

# 3. Replay the artifact (anywhere)
bugproof replay demo.bug
```

If `bugproof` isn't on your `PATH`, install it first:

```bash
npm install -g bugproof
```

## Why these four

These examples were picked to cover the real failure modes you'll see in the wild:

- **Missing dependency** — most common bug class
- **Timeout / hang** — second most common, hardest to reproduce by description alone
- **Test-runner failure** — what CI actually fails on
- **Runtime classloader / module-resolution error** — the JVM/.NET/Python equivalent of "works in dev"

If your bug doesn't match any of these patterns, please [file an issue](https://github.com/sidinsearch/BugProof/issues) — we'll add it to the examples.
