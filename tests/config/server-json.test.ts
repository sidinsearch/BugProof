import * as fs from 'fs';
import * as path from 'path';

const SERVER_JSON_PATH = path.resolve(__dirname, '../../server.json');
const PACKAGE_JSON_PATH = path.resolve(__dirname, '../../package.json');

describe('server.json (MCP Registry manifest)', () => {
  let serverJson: Record<string, unknown>;
  let packageJson: Record<string, unknown>;

  beforeAll(() => {
    serverJson = JSON.parse(fs.readFileSync(SERVER_JSON_PATH, 'utf-8'));
    packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
  });

  it('should be valid JSON', () => {
    expect(serverJson).not.toBeNull();
  });

  it('should have required fields: name, description, version', () => {
    expect(serverJson.name).toBeDefined();
    expect(serverJson.description).toBeDefined();
    expect(serverJson.version).toBeDefined();
  });

  it('name should match mcpName in package.json', () => {
    expect(serverJson.name).toBe(packageJson.mcpName);
  });

  it('description should be at most 100 characters', () => {
    const desc = serverJson.description as string;
    expect(desc.length).toBeLessThanOrEqual(100);
  });

  it('version should match package.json version', () => {
    expect(serverJson.version).toBe(packageJson.version);
  });

  it('name should be in reverse-DNS format with one slash', () => {
    const name = serverJson.name as string;
    expect(name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
    expect(name.split('/')).toHaveLength(2);
  });

  it('should include a "title" field', () => {
    expect(serverJson.title).toBe('BugProof');
  });

  it('should include a "websiteUrl" field', () => {
    const url = serverJson.websiteUrl as string;
    expect(url).toMatch(/^https?:\/\//);
  });

  it('should include repository with url and source', () => {
    const repo = serverJson.repository as Record<string, string>;
    expect(repo.url).toBeDefined();
    expect(repo.source).toBe('github');
  });

  it('should include icons array with at least one entry', () => {
    const icons = serverJson.icons as Array<Record<string, unknown>>;
    expect(icons.length).toBeGreaterThanOrEqual(1);
    const icon = icons[0];
    expect(icon.src).toBeDefined();
    expect(icon.mimeType).toBeDefined();
    expect(icon.sizes).toBeDefined();
  });

  it('icon src should be an HTTPS URL', () => {
    const icons = serverJson.icons as Array<Record<string, unknown>>;
    for (const icon of icons) {
      expect(icon.src).toMatch(/^https:\/\//);
    }
  });

  it('should include packages array with at least one entry', () => {
    const packages = serverJson.packages as Array<Record<string, unknown>>;
    expect(packages.length).toBeGreaterThanOrEqual(1);
  });

  it('first package should reference npm registry with correct identifier', () => {
    const packages = serverJson.packages as Array<Record<string, unknown>>;
    const pkg = packages[0];
    expect(pkg.registryType).toBe('npm');
    expect(pkg.identifier).toBe(packageJson.name);
    expect(pkg.version).toBe(packageJson.version);
  });

  it('first package should use stdio transport', () => {
    const packages = serverJson.packages as Array<Record<string, unknown>>;
    const transport = packages[0].transport as Record<string, string>;
    expect(transport.type).toBe('stdio');
  });
});
