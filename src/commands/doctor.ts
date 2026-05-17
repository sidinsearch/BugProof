import { Command } from 'commander';
import * as os from 'os';
import { detectCapabilities } from '../sandbox/capabilities.js';
import { banner, section, warn, kvLine, statusRow } from '../utils/ui.js';

export const doctorCommand = new Command('doctor')
  .description('Verify host OS support for sandboxing and features')
  .option('--json', 'Output structured JSON instead of human-readable text')
  .action((options) => {
    const jsonMode = options.json === true;
    const caps = detectCapabilities();

    if (jsonMode) {
      console.log(JSON.stringify({
        host: {
          os: `${os.type()} ${os.release()}`,
          platform: caps.platform,
          architecture: os.arch(),
          node_version: process.version,
        },
        capabilities: caps,
      }, null, 2));
      return;
    }

    banner('Doctor');

    section('Host Information');
    kvLine('OS', `${os.type()} ${os.release()}`);
    kvLine('Platform', caps.platform);
    kvLine('Architecture', os.arch());
    kvLine('Node Version', process.version);
    console.log();

    section('Sandbox Capabilities');
    if (caps.platform === 'linux') {
      statusRow('Linux unshare (Namespaces)', caps.hasUnshare ? 'ok' : 'fail');
      statusRow('cgroups v2 (Resource Limits)', caps.hasCgroupsV2 ? 'ok' : 'fail');
      if (!caps.hasUnshare) {
        warn('Missing unshare. BugProof will run without namespace isolation.');
      }
    } else if (caps.platform === 'win32') {
      statusRow('Job Objects (Process Isolation)', caps.hasJobObjects ? 'ok' : 'warn', 'Best-effort on Windows');
      statusRow('netsh (Network Firewall)', caps.hasNetsh ? 'ok' : 'fail');
    } else if (caps.platform === 'darwin') {
      statusRow('sandbox-exec (Apple Seatbelt)', caps.hasSandboxExec ? 'ok' : 'fail');
      if (!caps.hasSandboxExec) {
        warn('Missing sandbox-exec. macOS sandbox profile isolation will be disabled.');
      }
    } else {
      warn(`Unsupported platform for native sandboxing: ${caps.platform}`);
    }

    console.log();
  });