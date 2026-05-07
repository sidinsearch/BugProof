import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig, findConfigFile, generateDefaultConfig, applyNameTemplate } from '../../src/config/loader.js';

describe('Config Loader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return defaults when no config file exists', () => {
    const config = loadConfig(tempDir);
    expect(config.timeout).toBe(300000);
    expect(config.skipSecrets).toBe(false);
    expect(config.exclude).toContain('node_modules/**');
  });

  it('should find and load .bugproofrc from the given directory', () => {
    const rcContent = JSON.stringify({ timeout: 60000, skipSecrets: true });
    fs.writeFileSync(path.join(tempDir, '.bugproofrc'), rcContent);

    const config = loadConfig(tempDir);
    expect(config.timeout).toBe(60000);
    expect(config.skipSecrets).toBe(true);
    // Defaults still present
    expect(config.exclude).toContain('node_modules/**');
  });

  it('should find .bugproofrc in parent directories', () => {
    const childDir = path.join(tempDir, 'nested', 'deep');
    fs.mkdirSync(childDir, { recursive: true });
    const rcContent = JSON.stringify({ timeout: 5000 });
    fs.writeFileSync(path.join(tempDir, '.bugproofrc'), rcContent);

    const config = loadConfig(childDir);
    expect(config.timeout).toBe(5000);
  });

  it('should merge user exclude patterns with defaults', () => {
    const rcContent = JSON.stringify({ exclude: ['*.log', 'tmp/**'] });
    fs.writeFileSync(path.join(tempDir, '.bugproofrc'), rcContent);

    const config = loadConfig(tempDir);
    expect(config.exclude).toContain('*.log');
    expect(config.exclude).toContain('tmp/**');
    expect(config.exclude).toContain('node_modules/**');
  });

  it('should return null when no config file is found', () => {
    const result = findConfigFile(tempDir);
    expect(result).toBeNull();
  });

  it('should generate valid default config JSON', () => {
    const content = generateDefaultConfig();
    const parsed = JSON.parse(content);
    expect(parsed.timeout).toBe(300000);
    expect(parsed.exclude).toBeInstanceOf(Array);
  });

  it('should apply name templates correctly', () => {
    const name = applyNameTemplate('bug_{timestamp}', {
      timestamp: 12345,
      command: 'npm test',
      exit_code: 1,
    });
    expect(name).toBe('bug_12345');
  });

  it('should handle command template with special chars', () => {
    const name = applyNameTemplate('{command}_{exit_code}', {
      timestamp: 12345,
      command: 'npm test --coverage',
      exit_code: 2,
    });
    expect(name).toBe('npm_test___coverage_2');
  });
});
