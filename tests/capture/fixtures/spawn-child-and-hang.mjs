import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

const markerPid = process.argv[2];
const markerAlive = process.argv[3];

const child = spawn(
  process.platform === 'win32' ? 'cmd.exe' : 'bash',
  [
    process.platform === 'win32' ? '/c' : '-c',
    process.platform === 'win32'
      ? `echo alive>"${markerAlive}" && ping -n 30 127.0.0.1 > nul`
      : `echo alive > "${markerAlive}"; sleep 30`
  ],
  { stdio: 'pipe', detached: true }
);

if (markerPid) {
  writeFileSync(markerPid, child.pid.toString());
}

child.unref();

setInterval(() => {}, 60000);
