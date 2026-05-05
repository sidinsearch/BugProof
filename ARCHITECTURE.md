# System Architecture: BugProof

BugProof is a cross-platform CLI tool designed to capture reproducible bugs as `.bug` artifacts. The architecture is broken into three main phases: **Capture**, **Packaging**, and **Replay (Bug-Box Sandbox)**.

## High-Level Data Flow

1. **Capture Phase (`src/capture/`)**
   - Reruns the failing command.
   - Streams `stdout`/`stderr` into memory (with safety buffer limits).
   - Generates a **Failure Fingerprint** (SHA-256 for exact matches, pattern extraction for fuzzy matches).
   - Retrieves the Git context (commit, branch, dirty state).

2. **Packaging Phase (`src/capture/packager.ts`)**
   - Resolves all git-tracked files in the working directory using `git ls-files`.
   - Copies files into a `files/` snapshot directory within the artifact (with symlink escape protection).
   - Sanitizes the environment variables to build `env.schema.json`, stripping secrets and leaving only required keys.
   - Assembles the `.bug` directory format containing `manifest.json`, `run.json`, and the file snapshot.

3. **Replay Phase & Sandbox (`src/replay/` & `src/sandbox/`)**
   - Mounts the artifact into the **Bug-Box Sandbox**.
   - Re-executes the command inside the isolated environment.
   - Uses the **Verdict Engine** to compare the expected and actual failure fingerprints.

---

## Bug-Box Sandbox Architecture

The **Bug-Box Sandbox** is the core execution isolation engine, ensuring that replaying an artifact on a host machine is secure, deterministic, and doesn't pollute the host filesystem or resources.

### 1. Filesystem Isolation (`src/sandbox/filesystem.ts`)
- Creates a structured temporary directory layout:
  - `files/`: Read-only source snapshot (locked via `chmod a-w` on Linux/macOS, or `icacls` deny rules on Windows).
  - `workspace/`: Read-write CWD for the replayed process.
  - `logs/`: Read-write `stdout`/`stderr` capture.
- **Permissions:** Applies restrictive root directory permissions (`chmod 0700` or Windows inherited ACL removal) to prevent other users from observing the sandbox.

### 2. Cross-Platform Execution (`src/sandbox/bugbox.ts`)
- Replay relies on dynamic execution overrides. A Windows artifact captured at `C:\Project\` will flawlessly replay on a Linux machine at `/tmp/bugbox-123/workspace/`.
- The orchestrator injects the localized `workingDirectory` into the replay engine, preventing `ENOENT` spawn failures across different operating systems.

### 3. Resource Limits (`src/sandbox/resources.ts`)
Bug-Box utilizes native OS capabilities to cap memory and CPU usage, preventing malicious or runaway artifacts from crashing the host machine:
- **Linux:** Uses `systemd-run` to spin up ephemeral **cgroups v2** slices (`MemoryMax`, `CPUQuota`).
- **Windows:** Uses a PowerShell wrapper to map the process to a **Job Object** with memory bounds (`Start-Process` with `$memLimitBytes`).
- **macOS (Planned):** Will use `sandbox-exec` with Seatbelt profiles.

---

## Security Model (`src/utils/security.ts`)

Since BugProof executes commands captured from potentially untrusted sources, it employs a strict security perimeter during replay:

1. **Environment Blocklist:**
   - Strips an extensive list of `DANGEROUS_ENV_VARS` from the artifact before execution.
   - Includes `PATH` (prevents binary hijacking), `LD_PRELOAD` / `NODE_OPTIONS` (prevents runtime code injection), `TEMP`/`TMP`/`APPDATA` (prevents arbitrary file redirection), and `SSL_CERT_FILE`/`NODE_EXTRA_CA_CERTS` (prevents MITM attacks via injected CA certificates).

2. **No Shell Execution:**
   - Commands are passed as strict argument arrays to `child_process.spawn({ shell: false })`. 
   - This makes shell injection vectors (e.g., `; rm -rf /`) impossible.

3. **Path Traversal Guards:**
   - Strict `isPathWithinBoundary` checks prevent `../../` escapes when unpacking or verifying artifact files.

4. **Process Timeouts:**
   - Hardware-level `SIGKILL` timeouts prevent infinite loops or hung servers from stalling the replay runner.
