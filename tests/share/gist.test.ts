import { sanitizeShareError } from '../../src/share/gist';

jest.mock('https-proxy-agent', () => ({ HttpsProxyAgent: class {} }));
describe('share error sanitization', () => {
  it('redacts bearer tokens', () => {
    const value = 'GitHub API error 401: Authorization: Bearer ghp_secret123';
    const sanitized = sanitizeShareError(value);
    expect(sanitized).not.toContain('ghp_secret123');
    expect(sanitized).toContain('[REDACTED]');
  });

  it('redacts token query patterns', () => {
    const value = 'request failed token=gho_supersecret';
    const sanitized = sanitizeShareError(value);
    expect(sanitized).not.toContain('gho_supersecret');
    expect(sanitized).toContain('[REDACTED]');
  });

  it('redacts authorization json blocks', () => {
    const value = '{"authorization":"Bearer ghu_sensitive"}';
    const sanitized = sanitizeShareError(value);
    expect(sanitized).toContain('"authorization":"[REDACTED]"');
    expect(sanitized).not.toContain('ghu_sensitive');
  });
});
