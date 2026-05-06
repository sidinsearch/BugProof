import { filterByExcludePatterns } from '../../src/utils/exclude';

describe('Exclude Filter Utility', () => {
  const sampleFiles = [
    'src/index.ts',
    'src/utils/helper.ts',
    'package.json',
    'package-lock.json',
    'dist/index.js',
    'dist/utils/helper.js',
    'docs/README.md',
    'coverage/lcov.info',
    'coverage/report.html',
    '.env',
    '.env.local',
    'test/fixtures/big-file.bin',
  ];

  it('should return all files when no exclude patterns given', () => {
    const result = filterByExcludePatterns(sampleFiles, []);
    expect(result).toEqual(sampleFiles);
  });

  it('should exclude files matching a directory glob', () => {
    const result = filterByExcludePatterns(sampleFiles, ['dist/**']);
    expect(result).not.toContain('dist/index.js');
    expect(result).not.toContain('dist/utils/helper.js');
    expect(result).toContain('src/index.ts');
  });

  it('should exclude files matching a file extension glob', () => {
    const result = filterByExcludePatterns(sampleFiles, ['*.json']);
    expect(result).not.toContain('package.json');
    expect(result).not.toContain('package-lock.json');
    expect(result).toContain('src/index.ts');
  });

  it('should exclude files matching an exact filename', () => {
    const result = filterByExcludePatterns(sampleFiles, ['.env', '.env.local']);
    expect(result).not.toContain('.env');
    expect(result).not.toContain('.env.local');
    expect(result).toContain('package.json');
  });

  it('should support multiple exclude patterns simultaneously', () => {
    const result = filterByExcludePatterns(sampleFiles, ['dist/**', 'coverage/**', '*.json']);
    expect(result).toEqual([
      'src/index.ts',
      'src/utils/helper.ts',
      'docs/README.md',
      '.env',
      '.env.local',
      'test/fixtures/big-file.bin',
    ]);
  });

  it('should handle glob patterns with nested directories', () => {
    const result = filterByExcludePatterns(sampleFiles, ['test/**']);
    expect(result).not.toContain('test/fixtures/big-file.bin');
    expect(result).toContain('src/index.ts');
  });

  it('should return empty array when all files are excluded', () => {
    const result = filterByExcludePatterns(sampleFiles, ['**']);
    expect(result).toEqual([]);
  });
});
