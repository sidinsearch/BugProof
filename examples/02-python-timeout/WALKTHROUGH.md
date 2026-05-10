# Example 2 — Python Timeout / Hang

## What you'll see

```
$ python3 app.py
starting workload...
upstream unreachable, retrying...
upstream unreachable, retrying...
^C  (eventually you give up and kill it)
```

The script never exits. Real-world version: a worker waiting on a Redis lock that's never released, an HTTP client without a read timeout, a deadlocked coroutine.

## Capture (with timeout)

This is **the only example where you must pass `--timeout`** — otherwise capture would block forever.

```bash
bugproof capture -n hang-demo --timeout 5000 -- python3 app.py
```

The capture engine:

1. Runs the command
2. Hits the 5-second timeout
3. SIGKILLs the process tree (cross-platform — uses Job Objects on Windows, process groups on POSIX)
4. Marks `failure.timeout = true` in the manifest
5. Fingerprints based on whatever stderr was produced before the kill

## Replay

```bash
bugproof replay hang-demo.bug
```

The replay engine reads `failure.timeout` from the artifact and applies the **same timeout** during replay. So you don't need to remember to pass `--timeout` again — it's recorded in the artifact.

Verdict: **REPRODUCTION CONFIRMED** — the script hung again, was killed at the same timeout, fingerprint matches.

## What this example proves

- Capture handles indefinite hangs gracefully (no zombie processes, no leaked resources)
- Timeouts are part of the artifact, not the CLI invocation — they travel with the bug
- Process-tree termination is cross-platform safe
- The fingerprint engine handles the "no clean stack trace" case (timeouts often kill mid-syscall)

## Tip: capturing the *partial* output

Even on a kill, BugProof captures every stderr line written before SIGKILL. Inspect with:

```bash
bugproof inspect hang-demo.bug
```

You'll see the `upstream unreachable, retrying...` lines that hint at the actual cause.
