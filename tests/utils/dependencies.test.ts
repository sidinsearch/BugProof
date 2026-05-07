import { detectMissingDependencies } from '../../src/utils/dependencies.js';

describe('Dependency Detection', () => {
  it('should detect missing Node.js modules (require)', () => {
    const stderr = "Error: Cannot find module 'express'\nRequire stack:\n- /app/index.js";
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(1);
    expect(deps[0].name).toBe('express');
    expect(deps[0].language).toBe('node');
    expect(deps[0].installCommand).toBe('npm install express');
  });

  it('should detect missing Node.js modules (ESM)', () => {
    const stderr = "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'lodash' imported from /app/index.js";
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(1);
    expect(deps[0].name).toBe('lodash');
    expect(deps[0].installCommand).toBe('npm install lodash');
  });

  it('should detect scoped packages', () => {
    const stderr = "Error: Cannot find module '@types/node'";
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(1);
    expect(deps[0].name).toBe('@types/node');
  });

  it('should detect missing Python modules', () => {
    const stderr = "Traceback:\n  File \"app.py\"\nModuleNotFoundError: No module named 'flask'";
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(1);
    expect(deps[0].name).toBe('flask');
    expect(deps[0].language).toBe('python');
    expect(deps[0].installCommand).toBe('pip install flask');
  });

  it('should detect missing Python submodules', () => {
    const stderr = "ModuleNotFoundError: No module named 'django.contrib'";
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(1);
    expect(deps[0].name).toBe('django');
  });

  it('should detect missing Ruby gems', () => {
    const stderr = "Could not find gem 'rails (>= 7.0)' in locally installed gems";
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(1);
    expect(deps[0].name).toBe('rails');
    expect(deps[0].installCommand).toBe('gem install rails');
  });

  it('should detect multiple missing dependencies', () => {
    const stderr = [
      "Error: Cannot find module 'express'",
      "Error: Cannot find module 'body-parser'",
    ].join('\n');
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(2);
    expect(deps.map(d => d.name)).toContain('express');
    expect(deps.map(d => d.name)).toContain('body-parser');
  });

  it('should not duplicate dependencies', () => {
    const stderr = [
      "Error: Cannot find module 'express'",
      "Error: Cannot find module 'express'",
    ].join('\n');
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(1);
  });

  it('should skip relative path requires', () => {
    const stderr = "Error: Cannot find module './utils/helper'";
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(0);
  });

  it('should detect missing system libraries', () => {
    const stderr = "error while loading shared libraries: libssl.so.1.1: cannot open";
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(1);
    expect(deps[0].name).toBe('ssl');
    expect(deps[0].language).toBe('system');
  });

  it('should return empty array for no dependency errors', () => {
    const stderr = "TypeError: Cannot read properties of null (reading 'name')";
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(0);
  });

  it('should detect Java ClassNotFoundException', () => {
    const stderr = "Exception in thread \"main\" java.lang.ClassNotFoundException: com.example.MyClass";
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(1);
    expect(deps[0].name).toBe('com.example.MyClass');
    expect(deps[0].language).toBe('java');
  });

  it('should detect Java NoClassDefFoundError', () => {
    const stderr = "Exception in thread \"main\" java.lang.NoClassDefFoundError: org/apache/commons/lang3/StringUtils";
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(1);
    expect(deps[0].name).toBe('org.apache.commons.lang3.StringUtils');
    expect(deps[0].language).toBe('java');
  });

  it('should detect Maven dependency not found', () => {
    const stderr = "[ERROR] Could not find artifact org.springframework:spring-core:jar:5.3.0";
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(1);
    expect(deps[0].name).toBe('org.springframework:spring-core:jar:5.3.0');
    expect(deps[0].language).toBe('java');
  });

  it('should detect C/C++ missing header', () => {
    const stderr = "main.cpp:1:10: fatal error: openssl/ssl.h: No such file or directory";
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(1);
    expect(deps[0].name).toBe('openssl/ssl.h');
    expect(deps[0].language).toBe('cpp');
  });

  it('should detect C/C++ undefined reference', () => {
    const stderr = "/usr/bin/ld: main.o: undefined reference to `SSL_connect'";
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(1);
    expect(deps[0].name).toBe('SSL_connect');
    expect(deps[0].language).toBe('cpp');
  });

  it('should detect C/C++ missing linker library', () => {
    const stderr = "/usr/bin/ld: cannot find -lssl";
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(1);
    expect(deps[0].name).toBe('ssl');
    expect(deps[0].language).toBe('cpp');
    expect(deps[0].installCommand).toContain('apt install');
  });

  it('should detect .NET package not found', () => {
    const stderr = "error NU1101: Unable to find package Newtonsoft.Json";
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(1);
    expect(deps[0].name).toBe('Newtonsoft.Json');
    expect(deps[0].language).toBe('dotnet');
    expect(deps[0].installCommand).toContain('dotnet add package');
  });

  it('should detect .NET assembly not found', () => {
    const stderr = "Could not load file or assembly 'System.Data.SqlClient, Version=4.0'";
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(1);
    expect(deps[0].name).toBe('System.Data.SqlClient');
    expect(deps[0].language).toBe('dotnet');
  });

  it('should detect macOS dylib not found', () => {
    const stderr = "dyld: Library not loaded: /usr/local/lib/libpng.dylib";
    const deps = detectMissingDependencies(stderr);
    expect(deps.length).toBe(1);
    expect(deps[0].name).toBe('png');
    expect(deps[0].language).toBe('system');
    expect(deps[0].installCommand).toContain('brew install');
  });
});
