import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const FLAG_FILE = path.join(os.homedir(), '.bugproof', '.associations_registered');

jest.mock('child_process', () => ({
  spawnSync: jest.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
}));

const mockSpawnSync = () => require('child_process').spawnSync;

describe('registerAssociationsSilently', () => {
  beforeEach(() => {
    jest.resetModules();
    try { fs.unlinkSync(FLAG_FILE); } catch { /* ok */ }
  });

  it('should not throw on any platform', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const { registerAssociationsSilently } = require('../../src/utils/associations');
    expect(() => registerAssociationsSilently()).not.toThrow();
  });

  it('should skip reg.exe calls on non-Windows platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const { registerAssociationsSilently } = require('../../src/utils/associations');
    registerAssociationsSilently();
    expect(mockSpawnSync()).not.toHaveBeenCalled();
  });

  it('should be idempotent (flag file prevents re-execution)', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const { registerAssociationsSilently } = require('../../src/utils/associations');
    registerAssociationsSilently();
    registerAssociationsSilently();
    expect(mockSpawnSync()).toHaveBeenCalledTimes(3);
  });
});
