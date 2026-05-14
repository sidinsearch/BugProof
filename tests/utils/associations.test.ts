import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const FLAG_FILE = path.join(os.homedir(), '.bugproof', '.associations_registered');

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(value: string): void {
  Object.defineProperty(process, 'platform', { value, configurable: true, writable: true });
}

jest.mock('child_process', () => ({
  spawnSync: jest.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
}));

const mockSpawnSync = () => require('child_process').spawnSync;

describe('registerAssociationsSilently', () => {
  beforeEach(() => {
    jest.resetModules();
    try { fs.unlinkSync(FLAG_FILE); } catch { /* ok */ }
  });

  afterAll(() => {
    setPlatform(ORIGINAL_PLATFORM);
  });

  it('should not throw on any platform', () => {
    setPlatform('win32');
    const { registerAssociationsSilently } = require('../../src/utils/associations');
    expect(() => registerAssociationsSilently()).not.toThrow();
  });

  it('should skip reg.exe calls on non-Windows platforms', () => {
    setPlatform('linux');
    const { registerAssociationsSilently } = require('../../src/utils/associations');
    registerAssociationsSilently();
    expect(mockSpawnSync()).not.toHaveBeenCalled();
  });

  it('should be idempotent (flag file prevents re-execution)', () => {
    setPlatform('win32');
    const { registerAssociationsSilently } = require('../../src/utils/associations');
    registerAssociationsSilently();
    registerAssociationsSilently();
    expect(mockSpawnSync()).toHaveBeenCalledTimes(3);
  });
});
