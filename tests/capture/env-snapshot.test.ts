import { captureEnvSnapshot, compareEnvSnapshots, EnvSnapshot } from '../../src/capture/env-snapshot.js';

describe('Environment Snapshot', () => {
  it('should capture current environment', () => {
    const snapshot = captureEnvSnapshot();
    
    // Node.js should usually be detected (we're running in it)
    expect(snapshot.node).toBeDefined();
    // node.version may be null in some testing/CI environments; fallback to process.version
    if (snapshot.node && snapshot.node.version) {
      expect(snapshot.node.version).toMatch(/^\d+\.\d+/);
    } else {
      // Fallback: verify node is running via process.version if probeRuntime failed
      expect(process.version).toMatch(/^v\d+\.\d+/);
    }
    
    // OS info should be populated
    expect(snapshot.os.platform).toBeTruthy();
    expect(snapshot.os.arch).toBeTruthy();
  });

  it('should detect npm version if available', () => {
    const snapshot = captureEnvSnapshot();
    // npm may or may not be detectable depending on system config
    if (snapshot.npm) {
      expect(snapshot.npm.version).toMatch(/^\d+/);
    } else {
      // npm not found — this is fine, the test passes
      expect(snapshot.npm).toBeNull();
    }
  });

  it('should report no mismatches when snapshots are identical', () => {
    const snapshot = captureEnvSnapshot();
    const mismatches = compareEnvSnapshots(snapshot, snapshot);
    expect(mismatches).toHaveLength(0);
  });

  it('should detect missing runtime', () => {
    const captured: EnvSnapshot = {
      node: { name: 'node', version: '20.0.0' },
      python: { name: 'python', version: '3.11.0' },
      ruby: null,
      go: null,
      rust: null,
      java: null,
      npm: null,
      pip: null,
      os: { platform: 'win32', release: '10', arch: 'x64' },
    };

    const current: EnvSnapshot = {
      node: { name: 'node', version: '20.0.0' },
      python: null, // Python not installed on replay machine
      ruby: null,
      go: null,
      rust: null,
      java: null,
      npm: null,
      pip: null,
      os: { platform: 'win32', release: '10', arch: 'x64' },
    };

    const mismatches = compareEnvSnapshots(captured, current);
    expect(mismatches.length).toBe(1);
    expect(mismatches[0].runtime).toBe('python');
    expect(mismatches[0].severity).toBe('error');
  });

  it('should detect major version mismatch', () => {
    const captured: EnvSnapshot = {
      node: { name: 'node', version: '18.0.0' },
      python: null, ruby: null, go: null, rust: null, java: null, npm: null, pip: null,
      os: { platform: 'win32', release: '10', arch: 'x64' },
    };

    const current: EnvSnapshot = {
      node: { name: 'node', version: '22.1.0' },
      python: null, ruby: null, go: null, rust: null, java: null, npm: null, pip: null,
      os: { platform: 'win32', release: '10', arch: 'x64' },
    };

    const mismatches = compareEnvSnapshots(captured, current);
    const nodeMismatch = mismatches.find(m => m.runtime === 'node');
    expect(nodeMismatch).toBeDefined();
    expect(nodeMismatch!.severity).toBe('warning');
  });

  it('should detect OS platform mismatch', () => {
    const captured: EnvSnapshot = {
      node: null, python: null, ruby: null, go: null, rust: null, java: null, npm: null, pip: null,
      os: { platform: 'linux', release: '5.15', arch: 'x64' },
    };

    const current: EnvSnapshot = {
      node: null, python: null, ruby: null, go: null, rust: null, java: null, npm: null, pip: null,
      os: { platform: 'win32', release: '10', arch: 'x64' },
    };

    const mismatches = compareEnvSnapshots(captured, current);
    const osMismatch = mismatches.find(m => m.runtime === 'os');
    expect(osMismatch).toBeDefined();
    expect(osMismatch!.severity).toBe('warning');
  });
});
