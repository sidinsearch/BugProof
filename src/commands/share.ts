import { Command } from 'commander';
import * as fs from 'fs';
import { shareToGist, sanitizeShareError } from '../share/gist.js';
import { banner, error, info, kvLine, c, icons, Spinner } from '../utils/ui.js';

export const shareCommand = new Command('share')
  .description('Share a .bug artifact via GitHub Gist')
  .argument('<artifact>', 'Path to the .bug artifact')
  .option('--public', 'Create a public gist (default: secret/unlisted)')
  .option('--json', 'Output structured JSON')
  .action(async (artifact: string, options) => {
    const jsonMode = options.json === true;

    if (!fs.existsSync(artifact)) {
      if (jsonMode) {
        console.log(JSON.stringify({ success: false, error: `Artifact not found: ${artifact}` }));
      } else {
        error(`Artifact not found: ${artifact}`);
      }
      process.exit(1);
    }

    let spinner: Spinner | undefined;
    if (!jsonMode) {
      banner(`${icons.arrow} BugProof Share`);
      spinner = new Spinner('Uploading artifact to GitHub Gist');
      spinner.start();
    }

    try {
      const result = await shareToGist(artifact, { public: options.public });

      if (jsonMode) {
        console.log(JSON.stringify({
          success: true,
          url: result.url,
          gist_id: result.gistId,
        }, null, 2));
      } else {
        spinner?.stop('Artifact shared!');
        console.log();
        kvLine('URL', c.cyan(result.url));
        kvLine('Gist ID', result.gistId);
        console.log();
        info('Share this URL with your team. They can inspect the bug details directly on GitHub.');
        console.log();
      }
    } catch (err) {
      if (jsonMode) {
        console.log(JSON.stringify({ success: false, error: sanitizeShareError(String(err)) }));
      } else {
        spinner?.stop(sanitizeShareError(String(err)), true);
      }
      process.exit(1);
    }
  });