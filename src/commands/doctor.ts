import { Command } from 'commander';
import * as os from 'os';
import { detectCapabilities } from '../sandbox/capabilities.js';
import { banner, section, warn, kvLine, icons, statusBadge } from '../utils/ui.js';

export const doctorCommand = new Command('doctor')
  .description('Verify host OS support for sandboxing and features')
  .action(() => {
    banner(`${icons.arrow} BugProof Doctor`);
    const caps = detectCapabilities();

    section('Host Information');
    kvLine('OS', `${os.type()} ${os.release()}`);
    kvLine('Platform', caps.platform);
    kvLine('Architecture', os.arch());
    kvLine('Node Version', process.version);
    console.log();

    section('Sandbox Capabilities');
    if (caps.platform === 'linux') {
      statusBadge('Linux unshare (Namespaces)', caps.hasUnshare);
      statusBadge('cgroups v2 (Resource Limits)', caps.hasCgroupsV2);
      if (!caps.hasUnshare) {
        warn('Missing unshare. BugProof will run without namespace isolation.');
      }
    } else if (caps.platform === 'win32') {
      statusBadge('Job Objects (Process Isolation)', caps.hasJobObjects);
      statusBadge('netsh (Network Firewall)', caps.hasNetsh);
    } else if (caps.platform === 'darwin') {
      statusBadge('sandbox-exec (Apple Seatbelt)', caps.hasSandboxExec);
      if (!caps.hasSandboxExec) {
        warn('Missing sandbox-exec. macOS sandbox profile isolation will be disabled.');
      }
    } else {
      warn(`Unsupported platform for native sandboxing: ${caps.platform}`);
    }

    console.log();
  });