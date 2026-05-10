# Example 3 — Go Test Failure

## What you'll see

```
$ go test ./...
--- FAIL: TestSum (0.00s)
    main_test.go:18: Sum(1) = 0, want 1
    main_test.go:18: Sum(5) = 10, want 15
    main_test.go:18: Sum(10) = 45, want 55
    main_test.go:18: Sum(100) = 4950, want 5050
FAIL
exit status 1
```

A classic off-by-one bug in `Sum()` — uses `i < n` instead of `i <= n`. Every test case fails by exactly `n`.

## Capture

```bash
bugproof capture -n sum-bug -- go test ./...
```

Notice the capture engine:

1. **Detects Go** by spotting `go.mod` and `*.go` files. The artifact's `language_context` records `go: 1.21`.
2. **Records `GOPATH` and `GOROOT`** in the env schema so replay can match.
3. **Bundles only the small files** — no `vendor/` (excluded by default), no module cache.

## Replay

```bash
bugproof replay sum-bug.bug
```

Verdict: **REPRODUCTION CONFIRMED** — same 4 test failures, same exit code, same fingerprint.

## Replay on a different machine without `go` installed

```
$ bugproof replay sum-bug.bug
  Environment Mismatches
    ✘  go was available at capture but is not installed now.
  ✘  REPRODUCTION FAILED
  Hint: install Go 1.21+ and re-run.
```

## What this example proves

- Multi-language detection beyond Node/Python — works on Go too
- Test runner exit codes (1 vs 2 vs killed) are recorded faithfully
- Environment mismatches surface *before* the replay runs, saving CI time
- Even a small bug (3-line diff) produces a fully shareable artifact

## Bonus: fix and diff

Try fixing the off-by-one (`i <= n`) and re-capturing:

```bash
# After editing main.go
bugproof capture -n sum-fixed -- go test ./...
bugproof diff sum-bug.bug sum-fixed.bug
```

The diff will show:

- Different exit codes (1 → 0)
- Different fingerprints
- The actual source diff in `main.go`

This is the workflow for proving a fix actually fixes a bug.
