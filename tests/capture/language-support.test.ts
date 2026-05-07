import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { detectProjectLanguages } from '../../src/capture/language-support.js';

describe('Language Support Detection', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-lang-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should detect Node.js project via package.json', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
    fs.writeFileSync(path.join(tempDir, 'index.js'), 'console.log("hi")');

    const result = detectProjectLanguages(tempDir);

    expect(result.primary).not.toBeNull();
    expect(result.primary!.id).toMatch(/javascript|typescript/);
    expect(result.primary!.crossPlatform).toBe('high');
  });

  it('should detect TypeScript project with tsconfig', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'ts-test' }));
    fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');

    const result = detectProjectLanguages(tempDir);

    expect(result.primary!.id).toBe('typescript');
    expect(result.primary!.needsBuild).toBe(true);
    expect(result.buildCommands.some(c => c.includes('build'))).toBe(true);
  });

  it('should detect npm package manager with package-lock.json', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'package-lock.json'), '{}');

    const result = detectProjectLanguages(tempDir);

    expect(result.primary!.packageManager).toBe('npm');
    expect(result.primary!.lockfile).toBe('package-lock.json');
    expect(result.criticalFiles).toContain('package-lock.json');
  });

  it('should detect yarn package manager', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '');

    const result = detectProjectLanguages(tempDir);

    expect(result.primary!.packageManager).toBe('yarn');
    expect(result.primary!.lockfile).toBe('yarn.lock');
  });

  it('should detect pnpm package manager', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), '');

    const result = detectProjectLanguages(tempDir);

    expect(result.primary!.packageManager).toBe('pnpm');
  });

  it('should detect Python project', () => {
    fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'flask==2.0\n');
    fs.writeFileSync(path.join(tempDir, 'app.py'), 'import flask');

    const result = detectProjectLanguages(tempDir);

    expect(result.languages.some(l => l.id === 'python')).toBe(true);
    const python = result.languages.find(l => l.id === 'python')!;
    expect(python.crossPlatform).toBe('high');
    expect(result.buildCommands.some(c => c.includes('pip install'))).toBe(true);
    expect(result.criticalFiles).toContain('requirements.txt');
  });

  it('should detect Java/Maven project', () => {
    fs.writeFileSync(path.join(tempDir, 'pom.xml'), '<project></project>');

    const result = detectProjectLanguages(tempDir);

    expect(result.languages.some(l => l.id === 'java')).toBe(true);
    const java = result.languages.find(l => l.id === 'java')!;
    expect(java.buildSystem).toBe('maven');
    expect(java.needsBuild).toBe(true);
    expect(java.crossPlatform).toBe('high');
    expect(result.criticalFiles).toContain('pom.xml');
  });

  it('should detect Java/Gradle project', () => {
    fs.writeFileSync(path.join(tempDir, 'build.gradle'), 'plugins { id "java" }');

    const result = detectProjectLanguages(tempDir);

    const java = result.languages.find(l => l.id === 'java')!;
    expect(java.buildSystem).toBe('gradle');
  });

  it('should detect C/C++ CMake project', () => {
    fs.writeFileSync(path.join(tempDir, 'CMakeLists.txt'), 'cmake_minimum_required(VERSION 3.10)');
    fs.writeFileSync(path.join(tempDir, 'main.cpp'), '#include <iostream>');

    const result = detectProjectLanguages(tempDir);

    expect(result.languages.some(l => l.id === 'cpp')).toBe(true);
    const cpp = result.languages.find(l => l.id === 'cpp')!;
    expect(cpp.buildSystem).toBe('cmake');
    expect(cpp.needsBuild).toBe(true);
    expect(cpp.crossPlatform).toBe('low');
    expect(result.buildCommands.some(c => c.includes('cmake'))).toBe(true);
    expect(result.warnings.some(w => w.includes('recompiled'))).toBe(true);
  });

  it('should detect C/C++ Makefile project', () => {
    fs.writeFileSync(path.join(tempDir, 'Makefile'), 'all: main.o');
    fs.writeFileSync(path.join(tempDir, 'main.c'), '#include <stdio.h>');

    const result = detectProjectLanguages(tempDir);

    const cpp = result.languages.find(l => l.id === 'cpp')!;
    expect(cpp.buildSystem).toBe('make');
    expect(result.warnings.some(w => w.includes('platform-specific'))).toBe(true);
  });

  it('should detect Go project', () => {
    fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module example.com/test\n\ngo 1.21');
    fs.writeFileSync(path.join(tempDir, 'go.sum'), '');

    const result = detectProjectLanguages(tempDir);

    expect(result.languages.some(l => l.id === 'go')).toBe(true);
    const go = result.languages.find(l => l.id === 'go')!;
    expect(go.buildSystem).toBe('go');
    expect(go.crossPlatform).toBe('medium');
    expect(result.criticalFiles).toContain('go.mod');
    expect(result.criticalFiles).toContain('go.sum');
  });

  it('should detect Rust project', () => {
    fs.writeFileSync(path.join(tempDir, 'Cargo.toml'), '[package]\nname = "test"');
    fs.writeFileSync(path.join(tempDir, 'Cargo.lock'), '');

    const result = detectProjectLanguages(tempDir);

    expect(result.languages.some(l => l.id === 'rust')).toBe(true);
    const rust = result.languages.find(l => l.id === 'rust')!;
    expect(rust.buildSystem).toBe('cargo');
    expect(rust.crossPlatform).toBe('medium');
    expect(result.criticalFiles).toContain('Cargo.toml');
  });

  it('should detect .NET project', () => {
    fs.writeFileSync(path.join(tempDir, 'MyApp.csproj'), '<Project Sdk="Microsoft.NET.Sdk" />');

    const result = detectProjectLanguages(tempDir);

    expect(result.languages.some(l => l.id === 'dotnet')).toBe(true);
    const dotnet = result.languages.find(l => l.id === 'dotnet')!;
    expect(dotnet.buildSystem).toBe('dotnet');
    expect(dotnet.crossPlatform).toBe('high');
    expect(result.buildCommands.some(c => c.includes('dotnet build'))).toBe(true);
  });

  it('should detect multiple languages in a project', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'flask');
    fs.writeFileSync(path.join(tempDir, 'app.py'), 'import flask');

    const result = detectProjectLanguages(tempDir);

    expect(result.languages.length).toBeGreaterThanOrEqual(2);
  });

  it('should return empty context for unknown project', () => {
    fs.writeFileSync(path.join(tempDir, 'readme.txt'), 'Just a text file');

    const result = detectProjectLanguages(tempDir);

    expect(result.languages).toHaveLength(0);
    expect(result.primary).toBeNull();
    expect(result.buildCommands).toHaveLength(0);
  });

  it('should include critical files needed for reproduction', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');

    const result = detectProjectLanguages(tempDir);

    expect(result.criticalFiles).toContain('package.json');
    expect(result.criticalFiles).toContain('package-lock.json');
    expect(result.criticalFiles).toContain('tsconfig.json');
  });
});
