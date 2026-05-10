import { scanEnvironmentForSecrets, buildEnvironmentSchema, sanitizePII } from '../../src/utils/secrets';

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

  describe('sanitizePII', () => {
    it('should mask email addresses', () => {
      const text = 'Contact me at admin@example.com for more info.';
      expect(sanitizePII(text)).toBe('Contact me at [REDACTED_EMAIL] for more info.');
    });

    it('should mask IPv4 addresses', () => {
      const text = 'Failed to connect to 192.168.1.100.';
      expect(sanitizePII(text)).toBe('Failed to connect to [REDACTED_IP].');
    });

    it('should mask Stripe API keys', () => {
      const text = 'Using key sk_live_51Habcdefghijklmnopqrstuvwxyz';
      expect(sanitizePII(text)).toBe('Using key [REDACTED_STRIPE_KEY]');
    });

    it('should mask GitHub tokens', () => {
      const text = 'Found token ghp_123456789012345678901234567890123456 in env.';
      expect(sanitizePII(text)).toBe('Found token [REDACTED_GITHUB_TOKEN] in env.');
    });

    it('should mask Credit Card numbers', () => {
      const text = 'Payment failed for card 4111-1111-1111-1111 on checkout.';
      expect(sanitizePII(text)).toBe('Payment failed for card [REDACTED_CREDIT_CARD] on checkout.');
      
      const text2 = 'Another card 4111111111111111 failed.';
      expect(sanitizePII(text2)).toBe('Another card [REDACTED_CREDIT_CARD] failed.');
    });

    it('should leave normal text alone', () => {
      const text = 'This is a normal log message with numbers 1234 and words.';
      expect(sanitizePII(text)).toBe(text);
    });
  });
});
