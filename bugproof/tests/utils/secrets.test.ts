import { scanEnvironmentForSecrets, buildEnvironmentSchema } from '../../src/utils/secrets';

describe('Secrets Utility', () => {
  describe('scanEnvironmentForSecrets', () => {
    it('should detect explicit secret keys', () => {
      const env = {
        NORMAL_VAR: '12345',
        AWS_SECRET_ACCESS_KEY: 'some-fake-key',
        GITHUB_TOKEN: 'ghp_12345'
      };
      
      const result = scanEnvironmentForSecrets(env);
      expect(result.hasSecrets).toBe(true);
      expect(result.detectedKeys).toContain('AWS_SECRET_ACCESS_KEY');
      expect(result.detectedKeys).toContain('GITHUB_TOKEN');
      expect(result.detectedKeys).not.toContain('NORMAL_VAR');
    });

    it('should detect keys matching the word secret or token', () => {
      const env = {
        MY_APP_SECRET: 'test',
        API_KEY_DEV: 'test',
        SAFE_VAR: 'test'
      };
      
      const result = scanEnvironmentForSecrets(env);
      expect(result.hasSecrets).toBe(true);
      expect(result.detectedKeys).toContain('MY_APP_SECRET');
      expect(result.detectedKeys).toContain('API_KEY_DEV');
      expect(result.detectedKeys).not.toContain('SAFE_VAR');
    });

    it('should return empty array if no secrets found', () => {
      const env = {
        PATH: '/usr/bin',
        NODE_ENV: 'development'
      };
      
      const result = scanEnvironmentForSecrets(env);
      expect(result.hasSecrets).toBe(false);
      expect(result.detectedKeys).toHaveLength(0);
    });
  });

  describe('buildEnvironmentSchema', () => {
    it('should separate standard, optional, and secret variables', () => {
      const env = {
        PATH: '/usr/bin',
        MY_APP_DEBUG: 'true',
        API_KEY: 'secret-123'
      };
      
      const schema = buildEnvironmentSchema(env, ['API_KEY']);
      
      expect(schema.secrets).toEqual(['API_KEY']);
      expect(schema.optional).toEqual(['MY_APP_DEBUG']);
      expect(schema.required).toEqual([]); // Empty by default
    });
  });
});
