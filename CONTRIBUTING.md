# Contributing to BugProof

Thank you for your interest! BugProof is MIT-licensed and welcomes pull requests, bug reports, and feature suggestions.

---

## Prerequisites

- **Node.js >= 18** — [nodejs.org](https://nodejs.org/)
- **Git** — any recent version
- **npm** — bundled with Node.js

Optional language runtimes (Python, Java, Go, Rust) are only needed if you are working on the multi-language detection or self-heal features.

---

## Getting Started

```bash
git clone https://github.com/sidinsearch/BugProof.git
cd BugProof
npm install
npm run build
npm test        # should say 38 suites, 361 tests, all passing
```

---

## Project Structure

```
src/
  capture/          Execution engine, env snapshot, language detection, packager
  replay/           Restore, sandbox orchestration, verdict, self-heal
  sandbox/          OS-specific isolation (filesystem, network, process, resources)
  share/            GitHub Gist publisher
  diff/             Two-artifact diff engine
  utils/            signing, secrets, fingerprint, archive, security, UI helpers
  cli.ts            Commander entrypoint — 12 commands
tests/
  capture/          Unit tests for capture modules
  replay/           Unit tests for replay modules
  sandbox/          Unit tests for sandbox modules
  utils/            Unit tests for utility modules
  e2e/              End-to-end CLI tests (spawns the real binary)
  integration/      Multi-language integration tests
scripts/
  postinstall.cjs   File association + Node version check (runs on npm install)
  e2e-matrix.js     Cross-platform SSH matrix test runner
  release.cjs       Version bump + tag helper
```

---

## Development Workflow

```bash
npm run build          # compile TypeScript → dist/
npm test               # build + run all 38 Jest suites
npm run lint           # ESLint (strict TypeScript, no-any)
npm run test:watch     # Jest watch mode during development
npm run test:coverage  # coverage report
```

For a quick iteration loop:

```bash
npx tsx src/cli.ts capture -- node -e "throw new Error('demo')"
npx tsx src/cli.ts replay <artifact>.bug
```

---

## Code Style

- **TypeScript strict mode** — no `any` types (ESLint enforces `@typescript-eslint/no-explicit-any`).
- **ESM modules** — `import/export`, not `require`. Use `.js` extensions on all local imports.
- **Error handling** — never swallow errors silently. Surface them as CLI messages or throw to the caller.
- **No new runtime dependencies** unless absolutely unavoidable. The fewer deps, the smaller the attack surface and the faster the install.
- **Comments** — explain *why*, not *what*. Complex algorithms (entropy, fingerprinting, sandbox profiles) need doc-comments.

Run `npm run lint` before every commit. The CI will reject PRs with lint errors.

---

## Tests

Every new feature or bug fix **must include tests**. We use [Jest](https://jestjs.io/) with `ts-jest`.

```bash
# Run a single test file
npx jest tests/utils/secrets.test.ts

# Run tests matching a description
npx jest -t "entropy"
```

### Writing tests

- Place unit tests under `tests/<module>/`.
- Place CLI integration tests in `tests/e2e/cli.test.ts`.
- Use the `fixtureManifest()` / `fixtureFailure()` patterns already in the test files for consistency.
- Avoid testing private implementation details — test the public API / CLI surface.

### Coverage expectations

We do not enforce a hard coverage number, but reviewers will ask for tests covering:
- The happy path
- The primary error path(s)
- Any new flag or option added to the CLI

---

## Adding a New CLI Command

1. Add the command definition in `src/cli.ts` using the existing `program.command(...)` pattern.
2. Add the implementation in the appropriate `src/` module (capture, replay, utils, etc.).
3. Add unit tests for the new module.
4. Add an e2e test in `tests/e2e/cli.test.ts` that spawns the real binary.
5. Document the new command in `README.md` under the Commands section.
6. Add a CHANGELOG entry under the appropriate version.

---

## Pull Request Checklist

Before opening a PR, verify:

- [ ] `npm run build` passes with no TypeScript errors
- [ ] `npm run lint` passes with no ESLint errors or warnings
- [ ] `npm test` passes — all 38+ suites green
- [ ] New behaviour is covered by tests
- [ ] README.md updated if the user-facing interface changed
- [ ] CHANGELOG.md updated with a brief description of the change

---

## CI/CD

Every PR triggers the GitHub Actions workflow (`.github/workflows/ci.yml`) which:

1. Runs `npm run build && npm run lint && npm test` on **Ubuntu, Windows, and macOS** in parallel.
2. Reports pass/fail on each commit.

The workflow auto-publishes to npm on merges to `main` when the manual `release` trigger is used. Contributors do not need to manage this.

---

## Reporting Bugs

Please open a GitHub Issue. If the bug is in the CLI itself, you can capture it with BugProof and attach the `.bug` file:

```bash
bugproof capture -- npx bugproof <failing-command>
# attach the .bug file to the issue
```

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).