/**
 * Pull Engine — download .bug artifacts from GitHub Gist
 *
 * Fetches a shared gist, reconstructs the artifact directory locally,
 * and outputs the path so the user can replay it.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface PullResult {
  artifactPath: string;
  name: string;
  description: string;
  filesCount: number;
}

interface GistResponse {
  id: string;
  description: string;
  files: Record<string, { filename: string; raw_url: string; content?: string }>;
}

/**
 * Extract gist ID from various URL formats:
 *   - https://gist.github.com/user/abc123
 *   - https://gist.github.com/abc123
 *   - abc123 (raw ID)
 */
export function extractGistId(input: string): string {
  // Already a raw ID (32 hex chars)
  if (/^[a-f0-9]{32}$/i.test(input.trim())) {
    return input.trim();
  }
  // URL format
  const match = input.match(/gist\.github\.com\/[^/]+\/([a-f0-9]+)/i);
  if (match) {
    return match[1];
  }
  // Short URL: gist.github.com/abc123
  const shortMatch = input.match(/gist\.github\.com\/([a-f0-9]+)/i);
  if (shortMatch) {
    return shortMatch[1];
  }
  throw new Error(
    `Invalid gist URL or ID: ${input}\n` +
    'Expected: https://gist.github.com/user/abc123 or a 32-character gist ID',
  );
}

/**
 * Performs an HTTP GET request.
 */
function httpGet(url: string, token?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
    const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;

    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      agent,
      headers: {
        'User-Agent': 'BugProof-CLI',
        'Accept': 'application/vnd.github+json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        const location = res.headers.location;
        if (location) {
          httpGet(location, token).then(resolve, reject);
          return;
        }
      }

      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 200)}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(String(err)));
    });
    req.end();
  });
}

/**
 * Downloads a single file from a raw URL.
 */
function downloadFile(url: string): Promise<string> {
  return httpGet(url);
}

/**
 * Pulls a BugProof artifact from a GitHub Gist.
 *
 * Downloads all gist files and reconstructs the .bug artifact directory.
 * Works with both public and secret gists (no token needed for public gists).
 */
export async function pullFromGist(
  gistInput: string,
  outputDir?: string,
): Promise<PullResult> {
  const gistId = extractGistId(gistInput);
  const token = process.env.BUGPROOF_GITHUB_TOKEN || process.env.GITHUB_TOKEN;

  // 1. Fetch gist metadata
  const gistJson = await httpGet(`https://api.github.com/gists/${gistId}`, token);
  const gist: GistResponse = JSON.parse(gistJson);

  // 2. Find the manifest to get artifact name
  const manifestFile = gist.files['manifest.json'];
  if (!manifestFile) {
    throw new Error(
      'This gist does not contain a BugProof artifact (missing manifest.json).\n' +
      'Share an artifact with: bugproof share <artifact.bug>',
    );
  }

  let manifestContent: string;
  if (manifestFile.content) {
    manifestContent = manifestFile.content;
  } else if (manifestFile.raw_url) {
    manifestContent = await downloadFile(manifestFile.raw_url);
  } else {
    throw new Error('Could not fetch manifest.json from gist');
  }

  const manifest = JSON.parse(manifestContent);
  const artifactName = manifest.name || `gist-${gistId.slice(0, 8)}`;

  // 3. Create output directory
  const targetDir = outputDir || path.join(process.cwd(), `${artifactName}.bug`);
  fs.mkdirSync(targetDir, { recursive: true });

  // 4. Download all files
  const keyFiles = ['manifest.json', 'failure.json', 'run.json', 'env.schema.json', 'files.json'];
  const logFiles = ['stderr.log', 'stdout.log', 'README.md'];
  const allFiles = [...keyFiles, ...logFiles];

  let filesDownloaded = 0;

  for (const filename of allFiles) {
    const gistFile = gist.files[filename];
    if (!gistFile) continue;

    let content: string;
    if (gistFile.content) {
      content = gistFile.content;
    } else if (gistFile.raw_url) {
      content = await downloadFile(gistFile.raw_url);
    } else {
      continue;
    }

    fs.writeFileSync(path.join(targetDir, filename), content);
    filesDownloaded++;
  }

  // Also download any files/ entries if they were included in the gist
  // (gist sharing only includes metadata files, not source files)
  const sourceFilesDir = path.join(targetDir, 'files');
  if (manifest.files_count > 0 && !fs.existsSync(sourceFilesDir)) {
    // Source files are not included in gist shares (too large).
    // Create a marker file so replay knows to use fallback.
    fs.writeFileSync(
      path.join(targetDir, 'source-strategy.json'),
      JSON.stringify({
        strategy: 'gist-pull',
        reason: 'Source files not included in gist share. Replay will use artifact file snapshots if available, or require manual checkout.',
      }, null, 2),
    );
  }

  if (filesDownloaded === 0) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    throw new Error('No artifact files found in gist');
  }

  return {
    artifactPath: targetDir,
    name: artifactName,
    description: manifest.description || gist.description || '',
    filesCount: filesDownloaded,
  };
}
