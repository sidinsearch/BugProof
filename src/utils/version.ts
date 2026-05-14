import * as fs from 'fs';

let _versionCache: string | undefined;

export function getBugProofVersion(): string {
  if (!_versionCache) {
    _versionCache = JSON.parse(
      fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
    ).version;
  }
  return _versionCache!;
}
