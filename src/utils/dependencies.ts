/**
 * Dependency Detection Engine
 * 
 * Analyzes stderr output to detect missing dependencies and suggest
 * installation commands. Works across Node.js, Python, Ruby, Go, Rust, and more.
 */

export interface MissingDependency {
  name: string;
  language: string;
  installCommand: string;
  confidence: 'high' | 'medium' | 'low';
}

interface DetectionRule {
  pattern: RegExp;
  language: string;
  extractName: (match: RegExpMatchArray) => string;
  installCommand: (name: string) => string;
  confidence: MissingDependency['confidence'];
}

const DETECTION_RULES: DetectionRule[] = [
  // Node.js / npm
  {
    pattern: /Cannot find module ['"]([^'"]+)['"]/g,
    language: 'node',
    extractName: (m) => {
      const mod = m[1];
      if (mod.startsWith('.') || mod.startsWith('/')) return '';
      // Handle scoped packages: @scope/name
      if (mod.startsWith('@')) {
        const parts = mod.split('/');
        return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
      }
      return mod.split('/')[0];
    },
    installCommand: (name) => `npm install ${name}`,
    confidence: 'high',
  },
  {
    pattern: /Error \[ERR_MODULE_NOT_FOUND\]: Cannot find package '([^']+)'/g,
    language: 'node',
    extractName: (m) => m[1],
    installCommand: (name) => `npm install ${name}`,
    confidence: 'high',
  },
  // Python
  {
    pattern: /ModuleNotFoundError: No module named '([^']+)'/g,
    language: 'python',
    extractName: (m) => m[1].split('.')[0],
    installCommand: (name) => `pip install ${name}`,
    confidence: 'high',
  },
  {
    pattern: /ImportError: No module named (\S+)/g,
    language: 'python',
    extractName: (m) => m[1].split('.')[0],
    installCommand: (name) => `pip install ${name}`,
    confidence: 'high',
  },
  // Ruby
  {
    pattern: /cannot load such file -- ([^\s(]+)/g,
    language: 'ruby',
    extractName: (m) => m[1],
    installCommand: (name) => `gem install ${name}`,
    confidence: 'medium',
  },
  {
    pattern: /Could not find gem '([^']+)'/g,
    language: 'ruby',
    extractName: (m) => m[1].split(' ')[0],
    installCommand: (name) => `gem install ${name}`,
    confidence: 'high',
  },
  // Go
  {
    pattern: /cannot find package "([^"]+)"/g,
    language: 'go',
    extractName: (m) => m[1],
    installCommand: (name) => `go get ${name}`,
    confidence: 'high',
  },
  // Rust / Cargo
  {
    pattern: /error\[E0433\]: failed to resolve:.*`([^`]+)`/g,
    language: 'rust',
    extractName: (m) => m[1],
    installCommand: (name) => `cargo add ${name}`,
    confidence: 'medium',
  },
  // Java — ClassNotFoundException
  {
    pattern: /ClassNotFoundException:\s+([\w.]+)/g,
    language: 'java',
    extractName: (m) => m[1],
    installCommand: (name) => `# Add '${name}' to classpath or pom.xml/build.gradle`,
    confidence: 'high',
  },
  // Java — NoClassDefFoundError
  {
    pattern: /NoClassDefFoundError:\s+([\w/$]+)/g,
    language: 'java',
    extractName: (m) => m[1].replace(/\//g, '.').replace(/\$$/, ''),
    installCommand: (name) => `# Missing class: ${name}. Check dependencies and classpath.`,
    confidence: 'high',
  },
  // Java/Maven — dependency resolution failure
  {
    pattern: /Could not find artifact ([\w.:-]+)/g,
    language: 'java',
    extractName: (m) => m[1],
    installCommand: (name) => `# Maven: add <dependency> for ${name} to pom.xml`,
    confidence: 'high',
  },
  // Java/Gradle — dependency not found
  {
    pattern: /Could not resolve (?:all )?(?:dependencies|artifacts).*?>([\w.:-]+)/g,
    language: 'java',
    extractName: (m) => m[1],
    installCommand: (name) => `# Gradle: add implementation("${name}") to build.gradle`,
    confidence: 'medium',
  },
  // C/C++ — missing header
  {
    pattern: /fatal error:\s+([^\s:]+\.h):\s*No such file/g,
    language: 'cpp',
    extractName: (m) => m[1],
    installCommand: (name) => `# Install dev package for ${name}. Try: apt install lib*-dev`,
    confidence: 'high',
  },
  // C/C++ — undefined reference (linker)
  {
    pattern: /undefined reference to [`']([^'`]+)[`']/g,
    language: 'cpp',
    extractName: (m) => m[1],
    installCommand: (name) => `# Linker: missing symbol '${name}'. Add the library with -l flag.`,
    confidence: 'medium',
  },
  // C/C++ — cannot find -l (linker library)
  {
    pattern: /cannot find -l(\w+)/g,
    language: 'cpp',
    extractName: (m) => m[1],
    installCommand: (name) => `apt install lib${name}-dev  # (Debian/Ubuntu)`,
    confidence: 'high',
  },
  // .NET — package not found
  {
    pattern: /error NU1101: Unable to find package (\S+)/g,
    language: 'dotnet',
    extractName: (m) => m[1],
    installCommand: (name) => `dotnet add package ${name}`,
    confidence: 'high',
  },
  // .NET — assembly not found
  {
    pattern: /Could not load file or assembly '([^']+)'/g,
    language: 'dotnet',
    extractName: (m) => m[1].split(',')[0],
    installCommand: (name) => `dotnet add package ${name}`,
    confidence: 'medium',
  },
  // Kotlin — unresolved reference
  {
    pattern: /Unresolved reference: (\w+)/g,
    language: 'kotlin',
    extractName: (m) => m[1],
    installCommand: (name) => `# Kotlin: add dependency for '${name}' to build.gradle.kts`,
    confidence: 'medium',
  },
  // System libraries
  {
    pattern: /error while loading shared libraries: lib([^.]+)\.so/g,
    language: 'system',
    extractName: (m) => m[1],
    installCommand: (name) => `apt install lib${name}-dev  # (Debian/Ubuntu)`,
    confidence: 'medium',
  },
  // Windows DLL not found
  {
    pattern: /The specified module could not be found.*?(\w+\.dll)/gi,
    language: 'system',
    extractName: (m) => m[1],
    installCommand: (name) => `# Missing DLL: ${name}. Install the required runtime or library.`,
    confidence: 'medium',
  },
  // macOS — dylib not found
  {
    pattern: /Library not loaded:\s+.*?lib(\w+)\.dylib/g,
    language: 'system',
    extractName: (m) => m[1],
    installCommand: (name) => `brew install ${name}  # (macOS via Homebrew)`,
    confidence: 'medium',
  },
  // Generic "command not found"
  {
    pattern: /(?:command not found|not recognized as .* command)[:\s]+['"]?(\S+)/gi,
    language: 'system',
    extractName: (m) => m[1].replace(/['"]/g, ''),
    installCommand: (name) => `# Install '${name}' — check your package manager`,
    confidence: 'medium',
  },
];

/**
 * Scans stderr output and detects missing dependencies.
 * Returns a deduplicated list of dependencies with install commands.
 */
export function detectMissingDependencies(stderr: string): MissingDependency[] {
  const seen = new Set<string>();
  const deps: MissingDependency[] = [];

  for (const rule of DETECTION_RULES) {
    // Reset regex lastIndex for global patterns
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = rule.pattern.exec(stderr)) !== null) {
      const name = rule.extractName(match);
      if (!name || seen.has(`${rule.language}:${name}`)) continue;

      seen.add(`${rule.language}:${name}`);
      deps.push({
        name,
        language: rule.language,
        installCommand: rule.installCommand(name),
        confidence: rule.confidence,
      });
    }
  }

  return deps;
}
