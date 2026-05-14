/**
 * Share Engine — push .bug artifacts to GitHub Gist
 * 
 * Creates a secret gist with the artifact contents for easy sharing.
 * Recipients can download and replay with: bugproof pull <gist-url>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { extractZip } from '../utils/archive.js';

export interface ShareResult {
  url: string;
  gistId: string;
  rawUrl: string;
}

interface GistFile {
  content: string;
}

interface ShareCacheEntry {
  url: string;
  gistId: string;
  fingerprint: string;
  sharedAt: string;
}

const SHARE_CACHE_DIR = path.join(os.homedir(), '.bugproof', 'share-cache');
const SHARE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Checks if an identical artifact was shared recently.
 * Returns the cached URL if found within TTL, null otherwise.
 */
function findCachedShare(fingerprint: string): ShareCacheEntry | null {
  const cacheFile = path.join(SHARE_CACHE_DIR, 'cache.json');
  if (!fs.existsSync(cacheFile)) return null;

  try {
    const cache: ShareCacheEntry[] = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    const entry = cache.find(e => e.fingerprint === fingerprint);
    if (entry && Date.now() - new Date(entry.sharedAt).getTime() < SHARE_CACHE_TTL_MS) {
      return entry;
    }
    // Clean up expired entries
    const valid = cache.filter(e => Date.now() - new Date(e.sharedAt).getTime() < SHARE_CACHE_TTL_MS);
    if (valid.length !== cache.length) {
      fs.writeFileSync(cacheFile, JSON.stringify(valid, null, 2));
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Caches a share result for dedup.
 */
function cacheShare(fingerprint: string, result: ShareResult): void {
  try {
    fs.mkdirSync(SHARE_CACHE_DIR, { recursive: true });
    const cacheFile = path.join(SHARE_CACHE_DIR, 'cache.json');
    let cache: ShareCacheEntry[] = [];
    if (fs.existsSync(cacheFile)) {
      cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    }
    // Remove any existing entry for this fingerprint
    cache = cache.filter(e => e.fingerprint !== fingerprint);
    cache.push({
      url: result.url,
      gistId: result.gistId,
      fingerprint,
      sharedAt: new Date().toISOString(),
    });
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  } catch {
    // Best effort — cache failures should not block sharing
  }
}

/**
 * Computes a fingerprint for the artifact's key files.
 */
function computeArtifactFingerprint(targetDir: string): string {
  const hash = crypto.createHash('sha256');
  const keyFiles = ['manifest.json', 'failure.json', 'run.json'];
  for (const filename of keyFiles) {
    const filePath = path.join(targetDir, filename);
    if (fs.existsSync(filePath)) {
      hash.update(fs.readFileSync(filePath));
    }
  }
  return hash.digest('hex');
}

export function sanitizeShareError(input: string): string {
  return input
    .replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer [REDACTED]')
    .replace(/(gh[pousr]_[A-Za-z0-9_]+)/g, '[REDACTED_TOKEN]')
    .replace(/("authorization"\s*:\s*")([^"]+)(")/gi, '$1[REDACTED]$3')
    .replace(/(token\s*[=:]\s*)([^\s,]+)/gi, '$1[REDACTED]');
}

/**
 * Uploads artifact contents to a GitHub Gist.
 * Requires GITHUB_TOKEN or BUGPROOF_GITHUB_TOKEN env var.
 */
export async function shareToGist(
  artifactPath: string,
  options: { public?: boolean; description?: string } = {},
): Promise<ShareResult> {
  const token = process.env.BUGPROOF_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      'GitHub token required for sharing. Set GITHUB_TOKEN or BUGPROOF_GITHUB_TOKEN environment variable.\n' +
      'Create a token at: https://github.com/settings/tokens (needs "gist" scope)',
    );
  }

  // Extract artifact if it's a zip
  let extractDir: string | undefined;
  let targetDir: string;

  const stat = fs.statSync(artifactPath);
  if (stat.isFile()) {
    extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-share-'));
    await extractZip(artifactPath, extractDir);
    targetDir = extractDir;
  } else {
    targetDir = artifactPath;
  }

  try {
    // Read key files from the artifact
    const files: Record<string, GistFile> = {};
    const keyFiles = ['manifest.json', 'failure.json', 'run.json', 'env.schema.json'];

    for (const filename of keyFiles) {
      const filePath = path.join(targetDir, filename);
      if (fs.existsSync(filePath)) {
        files[filename] = { content: fs.readFileSync(filePath, 'utf-8') };
      }
    }

    // Check for duplicate share (same artifact shared within 5 minutes)
    const fingerprint = computeArtifactFingerprint(targetDir);
    const cached = findCachedShare(fingerprint);
    if (cached) {
      return { url: cached.url, gistId: cached.gistId, rawUrl: cached.url + '/raw' };
    }

    // Add a README for context
    const manifest = JSON.parse(fs.readFileSync(path.join(targetDir, 'manifest.json'), 'utf-8'));
    files['README.md'] = {
      content: generateGistReadme(manifest),
    };

    // Add stderr/stdout logs if they exist
    const stderrPath = path.join(targetDir, 'stderr.log');
    const stdoutPath = path.join(targetDir, 'stdout.log');
    if (fs.existsSync(stderrPath)) {
      const content = fs.readFileSync(stderrPath, 'utf-8');
      if (content.length <= 100000) { // Gist file size limit
        files['stderr.log'] = { content };
      }
    }
    if (fs.existsSync(stdoutPath)) {
      const content = fs.readFileSync(stdoutPath, 'utf-8');
      if (content.length <= 100000) {
        files['stdout.log'] = { content };
      }
    }

    // Create the gist
    const gistData = JSON.stringify({
      description: options.description || `BugProof: ${manifest.name} — ${manifest.description}`,
      public: options.public || false,
      files,
    });

    const result = await httpPost('https://api.github.com/gists', gistData, token);
    const parsed = JSON.parse(result);

    const shareResult = {
      url: parsed.html_url,
      gistId: parsed.id,
      rawUrl: parsed.html_url + '/raw',
    };

    // Cache for dedup (prevents accidental duplicate gists)
    cacheShare(fingerprint, shareResult);

    return shareResult;
  } finally {
    if (extractDir) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateGistReadme(manifest: any): string {
  return `# BugProof Artifact: ${manifest.name}

> ${manifest.description}

## Quick Replay

\`\`\`bash
# Download and replay this bug:
bugproof pull ${manifest.name}
\`\`\`

## Details

| Field | Value |
|-------|-------|
| Command | \`${manifest.command.join(' ')}\` |
| Exit Code | ${manifest.exit_code} |
| Platform | ${manifest.captured_on.os}/${manifest.captured_on.arch} |
| Node | ${manifest.captured_on.node_version} |
| Captured | ${manifest.captured_at} |
| Git | ${manifest.captured_on.git_branch || 'n/a'} @ ${(manifest.captured_on.git_commit || 'n/a').slice(0, 8)} |

## Files

${manifest.files_count} files captured (${(manifest.files_size_bytes / 1024).toFixed(1)} KB)

---
*Generated by [BugProof](https://github.com/sidinsearch/BugProof) v${manifest.bugproof_version}*
`;
}

function httpPost(url: string, data: string, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
    const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;

    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      agent,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'BugProof-CLI',
        'Accept': 'application/vnd.github+json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error(sanitizeShareError(`GitHub API error ${res.statusCode}: ${body}`)));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(sanitizeShareError(String(err))));
    });
    req.write(data);
    req.end();
  });
}
