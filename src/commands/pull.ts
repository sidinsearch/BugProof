import { Command } from 'commander';
import { pullFromGist } from '../share/pull.js';
import { banner, info, kvLine, c, icons, Spinner } from '../utils/ui.js';

export const pullCommand = new Command('pull')
  .description('Download a .bug artifact from a GitHub Gist')
  .argument('<gist>', 'Gist URL or ID (e.g. https://gist.github.com/user/abc123)')
  .option('-o, --output <dir>', 'Output directory (default: ./<artifact-name>.bug)')
  .option('--json', 'Output structured JSON instead of human-readable text')
  .action(async (gistInput: string, options) => {
    const jsonMode = options.json === true;

    if (!jsonMode) banner(`${icons.arrow} BugProof Pull`);

    let spinner: Spinner | undefined;
    if (!jsonMode) {
      spinner = new Spinner('Downloading artifact from GitHub Gist');
      spinner.start();
    }

    try {
      const result = await pullFromGist(gistInput, options.output);

      if (jsonMode) {
        console.log(JSON.stringify({
          success: true,
          artifact: {
            name: result.name,
            path: result.artifactPath,
            description: result.description,
            files: result.filesCount,
          },
        }, null, 2));
      } else {
        spinner?.stop('Artifact downloaded!');
        console.log();
        kvLine('Name', result.name);
        kvLine('Description', result.description);
        kvLine('Path', c.cyan(result.artifactPath));
        kvLine('Files', `${result.filesCount} metadata files`);
        console.log();
        info(`Replay with: ${c.cyan(`bugproof replay ${result.artifactPath}`)}`);
        console.log();
      }
    } catch (err) {
      if (!jsonMode) {
        spinner?.stop(String(err), true);
      } else {
        console.log(JSON.stringify({ success: false, error: String(err) }));
      }
      process.exit(1);
    }
  });
