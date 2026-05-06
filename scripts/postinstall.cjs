/* eslint-disable no-console */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const cliPath = path.join(rootDir, 'dist', 'cli.js');
const iconPath = path.join(rootDir, 'assets', 'icon-512x512.png');

function log(msg) {
  console.log(`[bugproof postinstall] ${msg}`);
}

function isCommandAvailable(command) {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8', timeout: 5000 });
  return result.status === 0;
}

function runCommand(command, args, timeout = 5000) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    timeout,
    stdio: 'ignore',
  });
}

function checkNodeVersion() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) {
    log(`WARNING: Node.js ${process.version} detected. BugProof requires Node.js >= 18.`);
  } else {
    log(`Node.js requirement satisfied (${process.version}).`);
  }
}

function checkGit() {
  if (isCommandAvailable('git')) {
    log('Git requirement satisfied.');
    return;
  }
  log('WARNING: Git is not installed or not in PATH. Capture/replay workflows need Git.');
}

function checkOptionalTooling() {
  const optional = ['python', 'python3', 'java', 'gcc', 'g++', 'go', 'rustc'];
  const available = optional.filter((tool) => isCommandAvailable(tool));
  if (available.length > 0) {
    log(`Optional language toolchains found: ${available.join(', ')}`);
  } else {
    log('Optional language toolchains not found. This is fine unless your bug command needs them.');
  }
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function registerWindowsAssociation() {
  if (process.platform !== 'win32') {
    return;
  }

  const reg = (args) => runCommand('reg', args, 5000);

  const openCommand = `\"${process.execPath}\" \"${cliPath}\" replay \"%1\"`;

  const outcomes = [];

  outcomes.push(reg(['add', 'HKCU\\Software\\Classes\\.bug', '/ve', '/d', 'BugProof.Artifact', '/f']));
  outcomes.push(reg([
    'add',
    'HKCU\\Software\\Classes\\BugProof.Artifact',
    '/ve',
    '/d',
    'BugProof Artifact',
    '/f',
  ]));

  if (fs.existsSync(iconPath)) {
    outcomes.push(reg([
      'add',
      'HKCU\\Software\\Classes\\BugProof.Artifact\\DefaultIcon',
      '/ve',
      '/d',
      iconPath,
      '/f',
    ]));
  }

  outcomes.push(reg([
    'add',
    'HKCU\\Software\\Classes\\BugProof.Artifact\\shell\\open\\command',
    '/ve',
    '/d',
    openCommand,
    '/f',
  ]));

  const failed = outcomes.some((result) => result.status !== 0);
  if (failed) {
    log('WARNING: Windows .bug association setup partially failed. Run scripts/bugproof-file-association-windows.reg manually.');
  } else {
    log('Windows .bug file association registered (HKCU).');
  }
}

function quoteDesktopExecArg(value) {
  return `"${value.replace(/(["\\`$])/g, '\\$1')}"`;
}

function registerLinuxAssociation() {
  if (process.platform !== 'linux') {
    return;
  }

  const home = os.homedir();
  const mimeDir = path.join(home, '.local', 'share', 'mime');
  const mimePackagesDir = path.join(mimeDir, 'packages');
  const appsDir = path.join(home, '.local', 'share', 'applications');
  const iconsDir = path.join(home, '.local', 'share', 'icons', 'hicolor', '512x512', 'mimetypes');
  const configDir = path.join(home, '.config');

  const mimeXmlPath = path.join(mimePackagesDir, 'bugproof.xml');
  const desktopPath = path.join(appsDir, 'bugproof.desktop');
  const mimeAppsPath = path.join(configDir, 'mimeapps.list');
  const iconTargetPath = path.join(iconsDir, 'application-x-bugproof.png');

  const mimeXml = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<mime-info xmlns=\"http://www.freedesktop.org/standards/shared-mime-info\">\n  <mime-type type=\"application/x-bugproof\">\n    <comment>BugProof Artifact</comment>\n    <glob pattern=\"*.bug\"/>\n  </mime-type>\n</mime-info>\n`;

  const desktopContent = `[Desktop Entry]\nName=BugProof Replay\nComment=Replay BugProof artifact\nExec=${quoteDesktopExecArg(process.execPath)} ${quoteDesktopExecArg(cliPath)} replay %f\nTerminal=true\nType=Application\nMimeType=application/x-bugproof;\nIcon=application-x-bugproof\nCategories=Development;Utility;\nNoDisplay=true\n`;

  ensureParentDir(mimeXmlPath);
  ensureParentDir(desktopPath);
  ensureParentDir(iconTargetPath);
  ensureParentDir(mimeAppsPath);

  fs.writeFileSync(mimeXmlPath, mimeXml, 'utf8');
  fs.writeFileSync(desktopPath, desktopContent, 'utf8');
  fs.chmodSync(desktopPath, 0o755);

  if (fs.existsSync(iconPath)) {
    fs.copyFileSync(iconPath, iconTargetPath);
  }

  const mimeAppsHeader = '[Default Applications]\n';
  const mimeAssocLine = 'application/x-bugproof=bugproof.desktop\n';
  if (!fs.existsSync(mimeAppsPath)) {
    fs.writeFileSync(mimeAppsPath, `${mimeAppsHeader}${mimeAssocLine}`, 'utf8');
  } else {
    const existing = fs.readFileSync(mimeAppsPath, 'utf8');
    if (!existing.includes(mimeAssocLine.trim())) {
      if (!existing.includes('[Default Applications]')) {
        fs.appendFileSync(mimeAppsPath, `\n${mimeAppsHeader}${mimeAssocLine}`, 'utf8');
      } else {
        fs.appendFileSync(mimeAppsPath, mimeAssocLine, 'utf8');
      }
    }
  }

  if (isCommandAvailable('update-mime-database')) {
    runCommand('update-mime-database', [mimeDir], 10000);
  }
  if (isCommandAvailable('update-desktop-database')) {
    runCommand('update-desktop-database', [appsDir], 10000);
  }
  if (isCommandAvailable('xdg-mime')) {
    runCommand('xdg-mime', ['default', 'bugproof.desktop', 'application/x-bugproof'], 10000);
  }

  log('Linux .bug file association registered (user scope).');
}

function registerMacAssociation() {
  if (process.platform !== 'darwin') {
    return;
  }

  const scriptPath = path.join(rootDir, 'scripts', 'bugproof-file-association-macos.sh');
  if (!fs.existsSync(scriptPath)) {
    log('macOS association script not found. Skipping file association setup.');
    return;
  }

  const result = spawnSync('bash', [scriptPath], { encoding: 'utf8', timeout: 15000 });
  if (result.status === 0) {
    log('macOS .bug file association registration attempted.');
  } else {
    log('WARNING: macOS file association setup failed. Run scripts/bugproof-file-association-macos.sh manually.');
  }
}

function main() {
  try {
    log('Starting install checks...');
    checkNodeVersion();
    checkGit();
    checkOptionalTooling();

    if (!fs.existsSync(cliPath)) {
      log('WARNING: dist/cli.js not found. Build artifact missing; file association registration skipped.');
      return;
    }

    registerWindowsAssociation();
    registerLinuxAssociation();
    registerMacAssociation();

    log('Install checks complete.');
  } catch (err) {
    log(`WARNING: postinstall completed with non-fatal error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main();
