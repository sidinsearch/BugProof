# Example 1 — Node.js Missing Module

## What you'll see

```
$ node app.js
Error: Cannot find module 'redis'
Require stack:
- ./app.js
```

A bog-standard `Cannot find module` failure. Devs see this constantly when:

- A teammate adds a dep and forgets to commit `package.json`
- `node_modules` is stale after a `git pull`
- A Docker layer cache picks up old deps

## Capture

```bash
bugproof capture -n redis-missing -- ./reproduce.sh
```

The artifact will:

1. Detect the missing module from stderr (high-confidence)
2. Fingerprint the failure as `Error: Cannot find module 'redis'`
3. Bundle `app.js`, `reproduce.sh`, and the project dir
4. Print a "Missing Dependencies Detected" section showing `npm install redis`

## Replay (vanilla)

```bash
bugproof replay redis-missing.bug
```

Verdict: **REPRODUCTION CONFIRMED** — the same module-not-found error fires.

## Replay with self-heal

```bash
bugproof replay --self-heal redis-missing.bug
```

What happens:

1. First replay fails — same `Cannot find module` error
2. Self-heal detects `redis` from stderr (high confidence, npm ecosystem)
3. Self-heal runs `npm install redis` inside the sandbox cwd
4. Self-heal retries the replay
5. Now it fails with a *different* error — `connect ECONNREFUSED 127.0.0.1:6379` (because no Redis server is actually running)

That second-stage failure is the real bug. Self-heal peeled away the install issue and surfaced the actual problem.

## What this example proves

- BugProof's dependency detection works on real Node stack traces
- `--self-heal` runs in a sandbox (it doesn't touch your global `node_modules`)
- The verdict engine differentiates "missing module" from "connection refused" — both are `ERR_MODULE_NOT_FOUND` and `ECONNREFUSED` respectively, and BugProof recognizes them as distinct error patterns
