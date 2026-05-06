/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function log(msg) {
  console.log(`\n📦 [bugproof release] ${msg}`);
}

function run(cmd, label) {
  log(`${label || 'Running'}: ${cmd}`);
  try {
    const result = execSync(cmd, { encoding: 'utf8', stdio: 'inherit' });
    return result;
  } catch (err) {
    console.error(`\n❌ Command failed: ${cmd}`);
    process.exit(1);
  }
}

function getVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  return pkg.version;
}

function main() {
  log('Starting release workflow...');

  const version = getVersion();
  log(`Current version: ${version}`);

  // Verify clean working directory
  const status = execSync('git status --porcelain', { encoding: 'utf8' });
  if (status.trim()) {
    console.error('\n❌ Working directory has uncommitted changes. Please commit or stash before releasing.');
    process.exit(1);
  }

  log('Working directory clean ✓');

  // Run tests
  run('npm test', 'Running test suite');
  log('Tests passed ✓');

  // Run lint
  run('npm run lint', 'Running linter');
  log('Lint passed ✓');

  // Build
  run('npm run build', 'Building');
  log('Build successful ✓');

  // Create git tag
  const tag = `v${version}`;
  run(`git tag -a ${tag} -m "Release ${tag}"`, `Creating git tag`);
  log(`Tag created: ${tag} ✓`);

  // Push tag to GitHub
  run('git push origin --tags', 'Pushing tags to GitHub');
  log('Tags pushed ✓');

  log(`\n✅ Release ${version} complete!`);
  log(`\nNext steps:`);
  log(`1. Publish to npm: npm publish`);
  log(`2. Publish to GitHub Packages: npm publish --registry https://npm.pkg.github.com`);
  log(`3. Create GitHub release: https://github.com/sidinsearch/BugProof/releases/new?tag=${tag}`);
}

main();
