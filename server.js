#!/usr/bin/env node

const http = require('node:http');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ISSUE_ROOT = path.resolve(process.env.ISSUE_WORKSPACE_ROOT || path.join(ROOT, '..', 'DokanCloud-issues'));
const PORT = Number(process.env.ORCHESTRATOR_PORT || 4177);
const HOST = process.env.ORCHESTRATOR_HOST || '127.0.0.1';
const DEFAULT_BASE_REF = process.env.ORCHESTRATOR_BASE_REF || 'origin/develop';
const GITHUB_ISSUES_REPO = process.env.GITHUB_ISSUES_REPO || 'getdokan/project';
const GITHUB_PR_REPOS = process.env.GITHUB_PR_REPOS || process.env.ORCHESTRATOR_PR_REPOS || '';
const REQUEST_LIMIT = 1024 * 1024;
const ATTACHMENT_LIMIT = 20;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

const RENAMED_REPOS = {
  'dokan-cloud': 'flycom-engine',
  dashboard: 'flycom-dashboard',
  'payment-service': 'flycom-payment-service',
  storefront: 'flycom-storefront',
  'integration-service': 'flycom-integration-service',
  'domain-service': 'flycom-domain-service',
  'content-service': 'flycom-content-service',
  'auth-service': 'flycom-auth-service',
  'browser-service': 'flycom-browser-service'
};
const LEGACY_REPOS_BY_NEW_NAME = Object.fromEntries(
  Object.entries(RENAMED_REPOS).map(([legacyName, newName]) => [newName, legacyName])
);
const REMOVED_REPOS = new Set(['tax-service']);

const IGNORED_ROOT_DIRS = new Set([
  '.claude',
  '.idea',
  '.junie',
  '.tinker',
  '.vscode',
  'docker',
  'docs',
  'developer-docs',
  'helm',
  'orchestrator-ui',
  'scripts',
  ...REMOVED_REPOS
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};

function nowIso() {
  return new Date().toISOString();
}

function exists(filePath) {
  return fsSync.existsSync(filePath);
}

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function textResponse(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function safeJoin(baseDir, requestPath) {
  return assertPathInside(baseDir, path.resolve(baseDir, requestPath), 'Path');
}

function assertPathInside(baseDir, targetPath, label = 'Path') {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);

  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error(`${label} escapes the allowed directory.`);
  }

  return resolvedTarget;
}

function assertIssueRootPath(targetPath, label = 'Workspace path') {
  return assertPathInside(ISSUE_ROOT, targetPath, label);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > REQUEST_LIMIT) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function run(command, args, cwd, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd,
        timeout: options.timeout || 120000,
        maxBuffer: options.maxBuffer || 1024 * 1024 * 12,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0'
        }
      },
      (error, stdout, stderr) => {
        const result = {
          command: [command, ...args].join(' '),
          cwd,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          code: error ? (error.code ?? null) : 0
        };

        if (error) {
          const wrapped = new Error(result.stderr || result.stdout || error.message);
          wrapped.result = result;
          reject(wrapped);
          return;
        }

        resolve(result);
      }
    );
  });
}

function copyToSystemClipboard(text) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'darwin') {
      reject(new Error('Server clipboard fallback is only configured for macOS pbcopy.'));
      return;
    }

    const child = spawn('pbcopy', [], {
      cwd: ROOT,
      stdio: ['pipe', 'ignore', 'pipe']
    });
    let stderr = '';

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `pbcopy exited with code ${code}`));
    });
    child.stdin.end(String(text || ''));
  });
}

async function tryRun(command, args, cwd, options = {}) {
  try {
    return {
      ok: true,
      result: await run(command, args, cwd, options)
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      result: error.result
    };
  }
}

async function git(repoPath, args, options = {}) {
  return run('git', args, repoPath, options);
}

async function tryGit(repoPath, args, options = {}) {
  return tryRun('git', args, repoPath, options);
}

async function readResponseBufferLimited(response) {
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Attachment is too large (${contentLength} bytes).`);
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachment is too large (${buffer.length} bytes).`);
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = Buffer.from(value);
    total += chunk.length;
    if (total > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes.`);
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function attachmentHeaders(url) {
  const headers = {
    Accept: 'image/*,application/octet-stream,*/*;q=0.8',
    'User-Agent': 'DokanCloud-Orchestrator'
  };

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const isGitHubHost = hostname === 'github.com' || hostname.endsWith('.github.com') || hostname.endsWith('githubusercontent.com');
    if (isGitHubHost && process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
  } catch {
    // URL was already normalized by the caller.
  }

  return headers;
}

async function downloadAttachment(issuePath, attachment, index) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(attachment.url, {
      headers: attachmentHeaders(attachment.url),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    if (!contentType.startsWith('image/') && !contentType.startsWith('application/octet-stream')) {
      throw new Error(`Attachment response is not an image (${contentType}).`);
    }

    const buffer = await readResponseBufferLimited(response);
    const filename = attachmentFilename(attachment, index, contentType);
    const attachmentDir = assertIssueRootPath(path.join(issuePath, 'attachments'), 'Attachment path');
    const filePath = assertIssueRootPath(path.join(attachmentDir, filename), 'Attachment file');

    await fs.mkdir(attachmentDir, { recursive: true });
    await fs.writeFile(filePath, buffer);

    return {
      ...attachment,
      status: 'saved',
      filename,
      relativePath: `attachments/${filename}`,
      path: filePath,
      contentType,
      size: buffer.length
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadWorkspaceAttachments(issuePath, attachments) {
  const records = [];

  for (const [index, attachment] of attachments.entries()) {
    try {
      records.push(await downloadAttachment(issuePath, attachment, index));
    } catch (error) {
      records.push({
        ...attachment,
        status: 'failed',
        error: error.message
      });
    }
  }

  return records;
}

function validateRepoName(repoName) {
  return path.join(ROOT, resolveRepoDirName(repoName));
}

function validateRef(ref) {
  if (!/^[A-Za-z0-9._/-]+$/.test(ref)) {
    throw new Error(`Invalid base ref: ${ref}`);
  }
}

function sanitizeSlug(input) {
  const raw = String(input || '').trim().toLowerCase();
  const slug = raw
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);

  if (!slug) {
    throw new Error('Issue id is required.');
  }

  if (/^\d+$/.test(slug)) {
    return `issue-${slug}`;
  }

  return slug.startsWith('issue-') ? slug : `issue-${slug}`;
}

function slugifyBranchPart(input, fallback = 'work') {
  const slug = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);

  return slug || fallback;
}

function issueTokenForBranch(issueId, slug) {
  const match = String(issueId || '').match(/\d+/);
  if (match) {
    return `issue-${match[0]}`;
  }

  return slugifyBranchPart(slug, 'issue');
}

function normalizeAttachmentUrl(value) {
  const raw = String(value || '')
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/[),.;]+$/g, '');

  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];

  const seen = new Set();
  const normalized = [];

  for (const item of attachments) {
    if (normalized.length >= ATTACHMENT_LIMIT) break;

    const url = normalizeAttachmentUrl(typeof item === 'string' ? item : item?.url);
    if (!url || seen.has(url)) continue;

    seen.add(url);
    normalized.push({
      url,
      alt: String(typeof item === 'object' && item ? item.alt || item.label || '' : '')
        .trim()
        .slice(0, 160)
    });
  }

  return normalized;
}

function repoDisplayName(repoName) {
  return RENAMED_REPOS[repoName] || repoName;
}

function canonicalRepoName(repoName) {
  return RENAMED_REPOS[repoName] || repoName;
}

function resolveRepoDirName(repoName) {
  const requested = String(repoName || '').trim();
  if (!/^[A-Za-z0-9._-]+$/.test(requested)) {
    throw new Error(`Invalid repo name: ${repoName}`);
  }

  const candidates = [...new Set([requested, LEGACY_REPOS_BY_NEW_NAME[requested]].filter(Boolean))];
  for (const candidate of candidates) {
    const repoPath = path.join(ROOT, candidate);
    const gitPath = path.join(repoPath, '.git');
    if (exists(repoPath) && exists(gitPath)) {
      return candidate;
    }
  }

  throw new Error(`Unknown Git repo: ${repoName}`);
}

function extensionForContentType(contentType) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  const map = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg'
  };

  return map[type] || '';
}

function extensionForUrl(url) {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (/^\.(png|jpe?g|gif|webp|svg)$/.test(ext)) return ext;
  } catch {
    return '';
  }

  return '';
}

function attachmentFilename(attachment, index, contentType) {
  const ext = extensionForContentType(contentType) || extensionForUrl(attachment.url) || '.bin';
  return `attachment-${String(index + 1).padStart(2, '0')}${ext}`;
}

function defaultBranchNameFor(issueId, title, slug) {
  const titlePart = slugifyBranchPart(title || slug, 'work');
  const issuePart = issueTokenForBranch(issueId, slug);
  return `fix/${titlePart}-${issuePart}`;
}

function validateBranchName(branch) {
  if (!/^[A-Za-z0-9._/-]+$/.test(branch)) {
    throw new Error(`Unsafe branch name: ${branch}`);
  }

  if (
    branch.startsWith('/') ||
    branch.endsWith('/') ||
    branch.includes('//') ||
    branch.includes('..') ||
    branch.includes('@{') ||
    branch.endsWith('.') ||
    branch.endsWith('.lock')
  ) {
    throw new Error(`Invalid branch name: ${branch}`);
  }
}

function branchNameFor(issueId, title, slug, requestedBranchName) {
  const branch = String(requestedBranchName || '').trim() || defaultBranchNameFor(issueId, title, slug);
  validateBranchName(branch);
  return branch;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function detectPackageManager(repoPath) {
  if (exists(path.join(repoPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (exists(path.join(repoPath, 'yarn.lock'))) return 'yarn';
  if (exists(path.join(repoPath, 'package-lock.json'))) return 'npm';
  if (exists(path.join(repoPath, 'package.json'))) return 'npm';
  return null;
}

function buildNodeChecks(packageManager, packageJson) {
  if (!packageManager || !packageJson || !packageJson.scripts) return [];

  const scripts = packageJson.scripts;
  const checks = [];

  if (scripts.lint) checks.push(`${packageManager} lint`);
  if (scripts.test) checks.push(`${packageManager} test`);
  if (scripts.build) checks.push(`${packageManager} build`);

  return checks;
}

async function classifyRepo(repoPath) {
  const packageJson = await readJson(path.join(repoPath, 'package.json'));
  const composerJson = await readJson(path.join(repoPath, 'composer.json'));
  const packageManager = await detectPackageManager(repoPath);
  const tech = [];
  const checks = [];

  if (composerJson) {
    tech.push('PHP');
    if (exists(path.join(repoPath, 'artisan'))) {
      tech.push('Laravel');
      checks.push('php artisan test');
      checks.push('./vendor/bin/phpstan analyse');
    }
  }

  if (packageJson) {
    const deps = {
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {})
    };

    if (deps.next) tech.push('Next.js');
    else if (deps.react && deps.vite) tech.push('React/Vite');
    else if (deps.typescript || packageJson.main || packageJson.type === 'module') tech.push('Node/TS');
    else tech.push('Node');

    checks.push(...buildNodeChecks(packageManager, packageJson));
  }

  if (exists(path.join(repoPath, 'docker-compose.yml')) || exists(path.join(repoPath, 'docker-compose.yaml'))) {
    tech.push('Compose');
  }

  return {
    packageManager,
    tech: [...new Set(tech)],
    checks: [...new Set(checks)]
  };
}

async function defaultBaseRefFor(repoPath, requestedRef) {
  // Ask git what the remote's default branch is (works after a fetch).
  const headRef = await tryGit(repoPath, ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'], { timeout: 15000 });
  const remoteDefault = headRef.ok && headRef.result.stdout ? headRef.result.stdout.trim() : null;

  const candidates = [...new Set([
    requestedRef,
    remoteDefault,
    'origin/develop',
    'origin/main',
    'origin/master',
    'develop',
    'main',
    'master'
  ].filter(Boolean))];

  for (const ref of candidates) {
    validateRef(ref);
    const check = await tryGit(repoPath, ['rev-parse', '--verify', `${ref}^{commit}`], { timeout: 15000 });
    if (check.ok) return ref;
  }

  throw new Error(`No usable base ref found. Tried: ${candidates.join(', ')}`);
}

async function repoSummary(repoName) {
  const repoPath = validateRepoName(repoName);
  const [branch, status, remote, worktrees, profile] = await Promise.all([
    tryGit(repoPath, ['branch', '--show-current'], { timeout: 15000 }),
    tryGit(repoPath, ['status', '--short'], { timeout: 15000 }),
    tryGit(repoPath, ['remote', 'get-url', 'origin'], { timeout: 15000 }),
    tryGit(repoPath, ['worktree', 'list', '--porcelain'], { timeout: 15000 }),
    classifyRepo(repoPath)
  ]);

  const dirtyLines = status.ok && status.result.stdout ? status.result.stdout.split('\n').filter(Boolean) : [];
  const activeWorktrees =
    worktrees.ok && worktrees.result.stdout
      ? worktrees.result.stdout
          .split('\n')
          .filter(line => line.startsWith('worktree '))
          .map(line => line.replace('worktree ', ''))
      : [];

  return {
    name: repoName,
    displayName: repoDisplayName(repoName),
    path: repoPath,
    branch: branch.ok ? branch.result.stdout || '(detached)' : 'unknown',
    dirtyCount: dirtyLines.length,
    remote: remote.ok ? remote.result.stdout : '',
    worktreeCount: activeWorktrees.length,
    packageManager: profile.packageManager,
    tech: profile.tech,
    checks: profile.checks
  };
}

async function listRepos() {
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  const repoNames = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => !IGNORED_ROOT_DIRS.has(name))
    .filter(name => exists(path.join(ROOT, name, '.git')))
    .sort((a, b) => a.localeCompare(b));

  return Promise.all(repoNames.map(repoSummary));
}

function validateGitHubRepo(repo) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error(`Invalid GitHub repo: ${repo}`);
  }
}

function canonicalGitHubRepo(repo) {
  validateGitHubRepo(repo);
  const [owner, repoName] = repo.split('/');
  if (REMOVED_REPOS.has(repoName)) return null;
  return `${owner}/${canonicalRepoName(repoName)}`;
}

function githubRepoFromRemote(remote) {
  const value = String(remote || '').trim().replace(/\.git$/, '');
  let match = value.match(/^git@github\.com:([^/]+\/[^/]+)$/);
  if (match) return match[1];

  match = value.match(/^ssh:\/\/git@github\.com\/([^/]+\/[^/]+)$/);
  if (match) return match[1];

  try {
    const parsed = new URL(value);
    if (parsed.hostname.toLowerCase() !== 'github.com') return null;
    const repo = parsed.pathname.replace(/^\/+/, '').replace(/\.git$/, '');
    validateGitHubRepo(repo);
    return repo;
  } catch {
    return null;
  }
}

function normalizeGitHubUser(user) {
  if (!user) return '';
  if (typeof user === 'string') return user;
  return user.login || user.name || '';
}

function normalizeGitHubLabels(labels) {
  if (!Array.isArray(labels)) return [];
  return labels.map(label => (typeof label === 'string' ? label : label.name)).filter(Boolean);
}

function normalizeGitHubUsers(users) {
  if (!Array.isArray(users)) return [];
  return users.map(normalizeGitHubUser).filter(Boolean);
}

function normalizeReviewDecision(value, isDraft) {
  if (isDraft) return 'DRAFT';
  return String(value || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
}

function normalizePullRequest(pr, repo, localRepo, displayName) {
  const number = Number(pr.number);
  const isDraft = Boolean(pr.isDraft ?? pr.draft);
  const base = pr.baseRefName || pr.base?.ref || '';
  const head = pr.headRefName || pr.head?.ref || '';
  const headOwner = normalizeGitHubUser(pr.headRepositoryOwner || pr.head?.repo?.owner);

  return {
    repo,
    localRepo,
    displayName: displayName || repoDisplayName(localRepo),
    number,
    title: pr.title || '',
    url: pr.url || pr.html_url || `https://github.com/${repo}/pull/${number}`,
    state: pr.state || 'OPEN',
    isDraft,
    author: normalizeGitHubUser(pr.author || pr.user),
    labels: normalizeGitHubLabels(pr.labels),
    assignees: normalizeGitHubUsers(pr.assignees),
    reviewDecision: normalizeReviewDecision(pr.reviewDecision, isDraft),
    baseRefName: base,
    headRefName: head,
    headOwner,
    createdAt: pr.createdAt || pr.created_at || null,
    updatedAt: pr.updatedAt || pr.updated_at || null
  };
}

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'DokanCloud-Orchestrator'
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

async function configuredPullRequestRepos() {
  const configured = GITHUB_PR_REPOS
    .split(',')
    .map(repo => repo.trim())
    .filter(Boolean);

  if (configured.length) {
    return configured.map(repo => {
      const canonicalRepo = canonicalGitHubRepo(repo);
      if (!canonicalRepo) return null;
      return {
        name: LEGACY_REPOS_BY_NEW_NAME[canonicalRepo.split('/')[1]] || canonicalRepo.split('/')[1],
        displayName: canonicalRepo.split('/')[1],
        repo: canonicalRepo,
        fallbackRepo: repo === canonicalRepo ? '' : repo,
        remote: `https://github.com/${canonicalRepo}.git`
      };
    }).filter(Boolean);
  }

  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  const repoNames = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => !IGNORED_ROOT_DIRS.has(name))
    .filter(name => exists(path.join(ROOT, name, '.git')))
    .sort((a, b) => a.localeCompare(b));

  const candidates = await Promise.all(
    repoNames.map(async name => {
      const repoPath = path.join(ROOT, name);
      const remote = await tryGit(repoPath, ['remote', 'get-url', 'origin'], { timeout: 15000 });
      const parsedRepo = remote.ok ? githubRepoFromRemote(remote.result.stdout) : null;
      const repo = parsedRepo ? canonicalGitHubRepo(parsedRepo) : null;
      return repo
        ? {
            name,
            displayName: repoDisplayName(name),
            repo,
            fallbackRepo: parsedRepo === repo ? '' : parsedRepo,
            remote: remote.result.stdout
          }
        : null;
    })
  );

  const seen = new Set();
  return candidates.filter(candidate => {
    if (!candidate || seen.has(candidate.repo)) return false;
    seen.add(candidate.repo);
    return true;
  });
}

async function listPullRequestsWithGh(target) {
  const reposToTry = [...new Set([target.repo, target.fallbackRepo].filter(Boolean))];
  let lastError = null;

  for (const repo of reposToTry) {
    try {
      const result = await run(
        'gh',
        [
          'pr',
          'list',
          '--repo',
          repo,
          '--state',
          'open',
          '--limit',
          '100',
          '--json',
          'number,title,url,state,isDraft,author,labels,assignees,reviewDecision,baseRefName,headRefName,headRepositoryOwner,createdAt,updatedAt'
        ],
        ROOT,
        { timeout: 60000, maxBuffer: 1024 * 1024 * 6 }
      );

      return JSON.parse(result.stdout || '[]').map(pr => normalizePullRequest(pr, target.repo, target.name, target.displayName));
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`No GitHub repo available for ${target.name}`);
}

async function listPullRequestsWithApi(target) {
  const reposToTry = [...new Set([target.repo, target.fallbackRepo].filter(Boolean))];
  let lastError = null;

  for (const repo of reposToTry) {
    const [owner, repoName] = repo.split('/');
    const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/pulls?state=open&per_page=100`, {
      headers: githubHeaders()
    });

    if (!response.ok) {
      lastError = new Error(`GitHub PRs unavailable for ${repo}: ${response.status} ${response.statusText}`);
      continue;
    }

    const pullRequests = await response.json();
    return pullRequests.map(pr => normalizePullRequest(pr, target.repo, target.name, target.displayName));
  }

  throw lastError || new Error(`GitHub PRs unavailable for ${target.repo}`);
}

async function listPullRequestsForRepo(target) {
  try {
    return {
      repo: target.repo,
      localRepo: target.name,
      displayName: target.displayName,
      source: 'gh',
      pullRequests: await listPullRequestsWithGh(target)
    };
  } catch (ghError) {
    try {
      return {
        repo: target.repo,
        localRepo: target.name,
        displayName: target.displayName,
        source: 'api',
        pullRequests: await listPullRequestsWithApi(target)
      };
    } catch (apiError) {
      return {
        repo: target.repo,
        localRepo: target.name,
        displayName: target.displayName,
        source: 'error',
        pullRequests: [],
        error: `${ghError.message}; ${apiError.message}`
      };
    }
  }
}

async function listGitHubPullRequests(filters = {}) {
  const viewer = await currentGitHubUser();
  const repoFilter = String(filters.repo || 'all').trim();
  const allTargets = await configuredPullRequestRepos();
  const targets =
    repoFilter && repoFilter !== 'all'
      ? allTargets.filter(target => target.repo === repoFilter || target.name === repoFilter)
      : allTargets;

  const results = await Promise.all(targets.map(listPullRequestsForRepo));
  const pullRequests = results
    .flatMap(result => result.pullRequests)
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  const errors = results
    .filter(result => result.error)
    .map(result => ({
      repo: result.repo,
      localRepo: result.localRepo,
      error: result.error
    }));
  const sources = [...new Set(results.filter(result => result.source !== 'error').map(result => result.source))];

  return {
    viewer,
    source: sources.length ? sources.join('+') : 'none',
    repositories: allTargets,
    errors,
    pullRequests
  };
}

function normalizeIssue(issue, repo) {
  const labels = Array.isArray(issue.labels)
    ? issue.labels.map(label => (typeof label === 'string' ? label : label.name)).filter(Boolean)
    : [];
  const assignees = Array.isArray(issue.assignees)
    ? issue.assignees.map(assignee => (typeof assignee === 'string' ? assignee : assignee.login)).filter(Boolean)
    : [];

  return {
    repo,
    number: Number(issue.number),
    title: issue.title || '',
    body: issue.body || '',
    state: issue.state || 'open',
    url: issue.url || issue.html_url || `https://github.com/${repo}/issues/${issue.number}`,
    labels,
    assignees,
    createdAt: issue.createdAt || issue.created_at || null,
    updatedAt: issue.updatedAt || issue.updated_at || null
  };
}

async function currentGitHubUser() {
  const ghResult = await tryRun('gh', ['api', 'user', '--jq', '.login'], ROOT, { timeout: 30000 });
  if (ghResult.ok && ghResult.result.stdout) {
    return ghResult.result.stdout;
  }

  if (!process.env.GITHUB_TOKEN) {
    return null;
  }

  const response = await fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'User-Agent': 'DokanCloud-Orchestrator'
    }
  });

  if (!response.ok) {
    return null;
  }

  const user = await response.json();
  return user.login || null;
}

async function listGitHubIssues(repo = GITHUB_ISSUES_REPO) {
  validateGitHubRepo(repo);
  const viewer = await currentGitHubUser();

  const ghResult = await tryRun(
    'gh',
    ['issue', 'list', '--repo', repo, '--state', 'open', '--limit', '100', '--json', 'number,title,body,url,state,labels,assignees,createdAt,updatedAt'],
    ROOT,
    { timeout: 60000 }
  );

  if (ghResult.ok) {
    const issues = JSON.parse(ghResult.result.stdout || '[]').map(issue => normalizeIssue(issue, repo));
    return {
      repo,
      source: 'gh',
      viewer,
      url: `https://github.com/${repo}/issues?q=is%3Aissue%20state%3Aopen`,
      issues
    };
  }

  const [owner, repoName] = repo.split('/');
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'DokanCloud-Orchestrator'
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/issues?state=open&per_page=100`, {
    headers
  });

  if (!response.ok) {
    throw new Error(`GitHub issues unavailable for ${repo}: ${response.status} ${response.statusText}`);
  }

  const rawIssues = await response.json();
  const issues = rawIssues.filter(issue => !issue.pull_request).map(issue => normalizeIssue(issue, repo));

  return {
    repo,
    source: 'api',
    viewer,
    url: `https://github.com/${repo}/issues?q=is%3Aissue%20state%3Aopen`,
    issues
  };
}

function metadataPath(issuePath) {
  return path.join(issuePath, 'ISSUE_WORKSPACE.json');
}

function markdownPath(issuePath) {
  return path.join(issuePath, 'ISSUE_WORKSPACE.md');
}

async function readWorkspaceMeta(issuePath) {
  const meta = await readJson(metadataPath(issuePath));
  if (!meta) return null;
  return meta;
}

function generateIssueMarkdown(meta) {
  const repoRows = meta.repos
    .map(repo => `| ${repo.displayName || repoDisplayName(repo.name)} | ${repo.branch} | ${repo.baseRef} | ${repo.path} |`)
    .join('\n');

  const verification = meta.repos
    .map(repo => {
      const checks = repo.checks && repo.checks.length ? repo.checks.map(check => `- ${repo.name}: \`${check}\``).join('\n') : `- ${repo.name}: define manual verification`;
      return checks;
    })
    .join('\n');

  const githubSection = meta.githubIssue
    ? `
## GitHub Issue

- Repo: ${meta.githubIssue.repo}
- Issue: #${meta.githubIssue.number} ${meta.githubIssue.title}
- URL: ${meta.githubIssue.url}
`
    : '';

  const attachmentSection =
    meta.attachments && meta.attachments.length
      ? `
## Attachments

${meta.attachments
  .map(attachment => {
    if (attachment.status === 'saved') {
      return `- [${attachment.filename}](${attachment.relativePath}) (${attachment.contentType}, ${attachment.size} bytes) - source: ${attachment.url}`;
    }

    return `- ${attachment.url} - ${attachment.status || 'pending'}${attachment.error ? `: ${attachment.error}` : ''}`;
  })
  .join('\n')}
`
      : '';

  const workerBriefSection = meta.workerBrief
    ? `
## Worker Brief

\`\`\`md
${meta.workerBrief}
\`\`\`
`
    : '';

  return `# ${meta.slug}

Title: ${meta.title || 'Untitled'}
Status: ${meta.status}
Created: ${meta.createdAt}
Base ref: ${meta.baseRef}
${githubSection}
${attachmentSection}

## Repos

| Repo | Branch | Base ref | Path |
| --- | --- | --- | --- |
${repoRows}

## Agent Lanes

| Lane | Owner |
| --- | --- |
| Orchestrator | ${meta.agents.orchestrator} |
| Worker | ${meta.agents.worker} |
| Observer | ${meta.agents.observer} |
| Standards | ${meta.agents.standards} |

## Verification

${verification}
${workerBriefSection}
`;
}

async function writeWorkspaceFiles(meta) {
  const json = `${JSON.stringify(meta, null, 2)}\n`;
  await fs.writeFile(metadataPath(meta.issuePath), json, 'utf8');
  await fs.writeFile(markdownPath(meta.issuePath), generateIssueMarkdown(meta), 'utf8');
}

async function listWorkspaces() {
  if (!exists(ISSUE_ROOT)) return [];

  const entries = await fs.readdir(ISSUE_ROOT, { withFileTypes: true });
  const dirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort((a, b) => b.localeCompare(a));
  return Promise.all(
    dirs.map(async dirName => {
    const issuePath = path.join(ISSUE_ROOT, dirName);
    const meta = await readWorkspaceMeta(issuePath);

    if (!meta) {
      return {
        slug: dirName,
        issuePath,
        status: 'untracked',
        title: '',
        repos: [],
        agents: {},
        createdAt: null,
        updatedAt: null
      };
    }

    const repos = await Promise.all(
      (meta.repos || []).map(async repo => {
        try {
          const repoPath = assertIssueRootPath(repo.path, 'Repo path');
          const status = await tryGit(repoPath, ['status', '--short'], { timeout: 15000 });
          const branch = await tryGit(repoPath, ['branch', '--show-current'], { timeout: 15000 });
          return {
            ...repo,
            path: repoPath,
            displayName: repo.displayName || repoDisplayName(repo.name),
            branch: branch.ok ? branch.result.stdout || repo.branch : repo.branch,
            dirtyCount: status.ok && status.result.stdout ? status.result.stdout.split('\n').filter(Boolean).length : 0,
            exists: exists(repoPath)
          };
        } catch (error) {
          return {
            ...repo,
            displayName: repo.displayName || repoDisplayName(repo.name),
            dirtyCount: 0,
            exists: false,
            error: error.message
          };
        }
      })
    );

    return {
      ...meta,
      repos
    };
    })
  );
}

function normalizeAgents(agents = {}) {
  return {
    orchestrator: agents.orchestrator || 'Codex',
    worker: agents.worker || 'Claude Code',
    observer: agents.observer || 'Antigravity',
    standards: agents.standards || 'Codex'
  };
}

async function rollbackCreatedWorktrees(meta) {
  const logs = [];

  for (const repo of [...(meta.repos || [])].reverse()) {
    try {
      const repoPath = assertIssueRootPath(repo.path, 'Repo path');
      const basePath = validateRepoName(repo.name);

      if (exists(repoPath)) {
        const removeResult = await git(basePath, ['worktree', 'remove', repoPath], { timeout: 120000 });
        logs.push({
          at: nowIso(),
          repo: repo.name,
          command: removeResult.command,
          output: removeResult.stdout || removeResult.stderr || 'Rolled back worktree.'
        });
      }

      const branch = repo.branch || meta.branchName;
      if (branch) {
        validateBranchName(branch);
        const branchResult = await tryGit(basePath, ['branch', '-d', branch], { timeout: 30000 });
        logs.push({
          at: nowIso(),
          repo: repo.name,
          command: branchResult.result?.command || `git branch -d ${branch}`,
          output: branchResult.ok ? branchResult.result.stdout || 'Deleted local branch.' : branchResult.error
        });
      }
    } catch (rollbackError) {
      logs.push({
        at: nowIso(),
        repo: repo.name,
        command: 'rollback',
        output: rollbackError.message
      });
    }
  }

  return logs;
}

async function createWorkspace(payload) {
  const issueId = payload.issueId || payload.issue || payload.slug;
  const slug = sanitizeSlug(issueId);
  const title = String(payload.title || '').trim();
  const baseRef = String(payload.baseRef || DEFAULT_BASE_REF).trim();
  const repos = Array.isArray(payload.repos) ? [...new Set(payload.repos)] : [];
  const branchName = branchNameFor(issueId, title, slug, payload.branchName);
  const fetchLatest = payload.fetchLatest !== false;
  const agents = normalizeAgents(payload.agents);
  const requestedAttachments = normalizeAttachments(payload.attachments);
  const githubIssue =
    payload.githubIssue && typeof payload.githubIssue === 'object'
      ? {
          repo: String(payload.githubIssue.repo || ''),
          number: Number(payload.githubIssue.number),
          title: String(payload.githubIssue.title || ''),
          url: String(payload.githubIssue.url || ''),
          labels: Array.isArray(payload.githubIssue.labels) ? payload.githubIssue.labels.map(String) : [],
          assignees: Array.isArray(payload.githubIssue.assignees) ? payload.githubIssue.assignees.map(String) : []
        }
      : null;
  const workerBrief = String(payload.workerBrief || '').trim();

  validateRef(baseRef);

  if (repos.length === 0) {
    throw new Error('Select at least one repo.');
  }

  const issuePath = assertIssueRootPath(path.join(ISSUE_ROOT, slug), 'Issue path');
  if (exists(issuePath)) {
    const error = new Error(`Workspace already exists: ${issuePath}`);
    error.statusCode = 409;
    throw error;
  }

  await fs.mkdir(ISSUE_ROOT, { recursive: true });
  await fs.mkdir(issuePath);

  const meta = {
    version: 1,
    issueId: String(issueId),
    slug,
    title,
    status: 'creating',
    baseRef,
    branchName,
    issueRoot: ISSUE_ROOT,
    issuePath,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    agents,
    githubIssue,
    workerBrief,
    attachments: requestedAttachments.map((attachment, index) => ({
      ...attachment,
      status: 'pending',
      index: index + 1
    })),
    repos: [],
    logs: []
  };

  await writeWorkspaceFiles(meta);

  try {
    if (requestedAttachments.length) {
      meta.attachments = await downloadWorkspaceAttachments(issuePath, requestedAttachments);
      meta.logs.push({
        at: nowIso(),
        repo: 'attachments',
        command: 'download attachments',
        output: `Saved ${meta.attachments.filter(attachment => attachment.status === 'saved').length}/${meta.attachments.length} attachments.`
      });
      meta.updatedAt = nowIso();
      await writeWorkspaceFiles(meta);
    }

    for (const repoName of repos) {
      const repoDirName = resolveRepoDirName(repoName);
      if (REMOVED_REPOS.has(repoDirName)) {
        throw new Error(`Repo is no longer part of the orchestrator list: ${repoDirName}`);
      }

      const repoPath = validateRepoName(repoDirName);
      const displayName = repoDisplayName(repoDirName);
      const branch = branchName;
      const targetPath = assertIssueRootPath(path.join(issuePath, displayName), 'Repo path');

      if (fetchLatest) {
        const fetchResult = await git(repoPath, ['fetch', '--prune', 'origin'], { timeout: 180000 });
        meta.logs.push({
          at: nowIso(),
          repo: displayName,
          command: fetchResult.command,
          output: fetchResult.stdout || fetchResult.stderr
        });
      }

      const resolvedBaseRef = await defaultBaseRefFor(repoPath, baseRef);
      const branchExists = await tryGit(repoPath, ['rev-parse', '--verify', `refs/heads/${branch}`], { timeout: 15000 });
      if (branchExists.ok) {
        throw new Error(`Branch already exists in ${repoName}: ${branch}`);
      }

      const profile = await classifyRepo(repoPath);
      const worktreeResult = await git(repoPath, ['worktree', 'add', targetPath, '-b', branch, resolvedBaseRef], { timeout: 180000 });

      meta.repos.push({
        name: repoDirName,
        displayName,
        branch,
        baseRef: resolvedBaseRef,
        basePath: repoPath,
        path: targetPath,
        checks: profile.checks,
        tech: profile.tech,
        packageManager: profile.packageManager
      });
      meta.logs.push({
        at: nowIso(),
        repo: displayName,
        command: worktreeResult.command,
        output: worktreeResult.stdout || worktreeResult.stderr
      });
      meta.updatedAt = nowIso();
      await writeWorkspaceFiles(meta);
    }

    meta.status = 'ready';
    meta.updatedAt = nowIso();
    await writeWorkspaceFiles(meta);
    return meta;
  } catch (error) {
    const rollbackLogs = await rollbackCreatedWorktrees(meta);
    meta.status = 'failed';
    meta.updatedAt = nowIso();
    meta.error = error.message;
    meta.logs = [...(meta.logs || []), ...rollbackLogs];
    await writeWorkspaceFiles(meta);
    error.workspace = meta;
    throw error;
  }
}

async function cleanupWorkspace(slug, payload) {
  const safeSlug = sanitizeSlug(slug);
  if (payload.confirm !== safeSlug) {
    const error = new Error(`Confirmation must match ${safeSlug}.`);
    error.statusCode = 400;
    throw error;
  }

  const issuePath = path.join(ISSUE_ROOT, safeSlug);
  const meta = await readWorkspaceMeta(issuePath);
  if (!meta) {
    const error = new Error(`Workspace metadata not found: ${safeSlug}`);
    error.statusCode = 404;
    throw error;
  }

  const logs = [];

  for (const repo of meta.repos || []) {
    if (!repo.path) {
      logs.push({
        at: nowIso(),
        repo: repo.name,
        command: 'skip',
        output: 'Path missing from workspace metadata.'
      });
      continue;
    }

    const repoPath = assertIssueRootPath(repo.path, 'Repo path');
    const basePath = validateRepoName(repo.name);

    if (!exists(repoPath)) {
      logs.push({
        at: nowIso(),
        repo: repo.name,
        command: 'skip',
        output: 'Path already removed.'
      });
      continue;
    }

    const result = await git(basePath, ['worktree', 'remove', repoPath], { timeout: 120000 });
    logs.push({
      at: nowIso(),
      repo: repo.name,
      command: result.command,
      output: result.stdout || result.stderr
    });

    const branch = repo.branch || meta.branchName;
    if (branch) {
      validateBranchName(branch);
      const branchResult = await tryGit(basePath, ['branch', '-d', branch], { timeout: 30000 });
      logs.push({
        at: nowIso(),
        repo: repo.name,
        command: branchResult.result?.command || `git branch -d ${branch}`,
        output: branchResult.ok ? branchResult.result.stdout || 'Deleted local branch.' : branchResult.error
      });
    }
  }

  meta.status = 'cleaned';
  meta.cleanedAt = nowIso();
  meta.updatedAt = nowIso();
  meta.logs = [...(meta.logs || []), ...logs];
  await writeWorkspaceFiles(meta);

  return meta;
}

async function workspaceMetaForSlug(slug) {
  const safeSlug = sanitizeSlug(slug);
  const issuePath = assertIssueRootPath(path.join(ISSUE_ROOT, safeSlug), 'Issue path');
  const meta = await readWorkspaceMeta(issuePath);

  if (!meta) {
    const error = new Error(`Workspace metadata not found: ${safeSlug}`);
    error.statusCode = 404;
    throw error;
  }

  const metaIssuePath = assertIssueRootPath(meta.issuePath || issuePath, 'Workspace path');
  if (!exists(metaIssuePath)) {
    const error = new Error(`Workspace path not found: ${safeSlug}`);
    error.statusCode = 404;
    throw error;
  }

  meta.issuePath = metaIssuePath;

  return meta;
}

function shellQuoteForTerminal(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function escapeAppleScriptString(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

async function openWorkspace(slug, payload) {
  const meta = await workspaceMetaForSlug(slug);
  const target = String(payload.target || '').trim();
  const allowedTargets = new Set(['finder', 'terminal', 'vscode', 'claude-code', 'claude-app']);

  if (!allowedTargets.has(target)) {
    const error = new Error(`Unsupported open target: ${target}`);
    error.statusCode = 400;
    throw error;
  }

  const issuePath = meta.issuePath;

  if (target === 'finder') {
    return run('open', [issuePath], ROOT, { timeout: 30000 });
  }

  if (target === 'terminal') {
    return run('open', ['-a', 'Terminal', issuePath], ROOT, { timeout: 30000 });
  }

  if (target === 'claude-app') {
    return run('open', ['-a', 'Claude'], ROOT, { timeout: 30000 });
  }

  if (target === 'claude-code') {
    const command = `cd ${shellQuoteForTerminal(issuePath)} && claude`;
    const script = `tell application "Terminal" to do script "${escapeAppleScriptString(command)}"`;
    return run('osascript', ['-e', script], ROOT, { timeout: 30000 });
  }

  const attempts = [
    ['open', ['-a', 'Visual Studio Code', issuePath]],
    ['open', ['-a', 'Code', issuePath]],
    ['code', [issuePath]]
  ];

  let lastError = null;
  for (const [command, args] of attempts) {
    try {
      return await run(command, args, ROOT, { timeout: 30000 });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Unable to open VS Code.');
}

async function openClaudeCodeSession(payload) {
  const requestedCwd = String(payload.cwd || ROOT).trim() || ROOT;
  const cwd = assertPathInside(ROOT, requestedCwd, 'Claude Code cwd');
  const prompt = String(payload.prompt || '').trim();

  if (!exists(cwd) || !fsSync.statSync(cwd).isDirectory()) {
    const error = new Error(`Claude Code cwd not found: ${cwd}`);
    error.statusCode = 404;
    throw error;
  }

  let copied = false;
  let copyError = '';
  if (prompt) {
    try {
      await copyToSystemClipboard(prompt);
      copied = true;
    } catch (error) {
      copyError = error.message;
    }
  }

  const command = `cd ${shellQuoteForTerminal(cwd)} && claude`;
  const script = `tell application "Terminal" to do script "${escapeAppleScriptString(command)}"`;
  await run('osascript', ['-e', script], ROOT, { timeout: 30000 });

  return {
    ok: true,
    cwd,
    copied,
    copyError
  };
}

async function purgeWorkspace(slug, payload) {
  const safeSlug = sanitizeSlug(slug);
  if (payload.confirm !== safeSlug) {
    const error = new Error(`Confirmation must match ${safeSlug}.`);
    error.statusCode = 400;
    throw error;
  }

  const issuePath = assertIssueRootPath(path.join(ISSUE_ROOT, safeSlug), 'Issue path');
  const meta = await readWorkspaceMeta(issuePath);

  for (const repo of meta?.repos || []) {
    if (!repo.path) continue;
    const repoPath = assertIssueRootPath(repo.path, 'Repo path');
    if (exists(repoPath)) {
      const error = new Error(`Cleanup ${safeSlug} before purging; ${repo.name} still exists.`);
      error.statusCode = 409;
      throw error;
    }
  }

  await fs.rm(issuePath, { recursive: true, force: true });
  return {
    slug: safeSlug,
    status: 'purged'
  };
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  const filePath = safeJoin(PUBLIC_DIR, pathname.replace(/^\/+/, ''));
  if (!exists(filePath) || fsSync.statSync(filePath).isDirectory()) {
    textResponse(res, 404, 'Not found');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const body = await fs.readFile(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': body.length
  });
  res.end(body);
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (url.pathname === '/api/health' && req.method === 'GET') {
    jsonResponse(res, 200, {
      ok: true,
      root: ROOT,
      issueRoot: ISSUE_ROOT,
      defaultBaseRef: DEFAULT_BASE_REF,
      githubIssuesRepo: GITHUB_ISSUES_REPO,
      node: process.version
    });
    return;
  }

  if (url.pathname === '/api/issues' && req.method === 'GET') {
    const repo = url.searchParams.get('repo') || GITHUB_ISSUES_REPO;
    jsonResponse(res, 200, await listGitHubIssues(repo));
    return;
  }

  if (url.pathname === '/api/pull-requests' && req.method === 'GET') {
    jsonResponse(res, 200, await listGitHubPullRequests({
      repo: url.searchParams.get('repo') || 'all'
    }));
    return;
  }

  if (url.pathname === '/api/repos' && req.method === 'GET') {
    jsonResponse(res, 200, {
      repos: await listRepos()
    });
    return;
  }

  if (url.pathname === '/api/workspaces' && req.method === 'GET') {
    jsonResponse(res, 200, {
      workspaces: await listWorkspaces()
    });
    return;
  }

  if (url.pathname === '/api/workspaces' && req.method === 'POST') {
    const body = await readBody(req);
    const workspace = await createWorkspace(body);
    jsonResponse(res, 201, {
      workspace
    });
    return;
  }

  if (url.pathname === '/api/clipboard' && req.method === 'POST') {
    const body = await readBody(req);
    await copyToSystemClipboard(body.text || '');
    jsonResponse(res, 200, {
      ok: true
    });
    return;
  }

  if (url.pathname === '/api/agents/claude-code' && req.method === 'POST') {
    const body = await readBody(req);
    jsonResponse(res, 200, await openClaudeCodeSession(body));
    return;
  }

  const cleanupMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/cleanup$/);
  if (cleanupMatch && req.method === 'POST') {
    const body = await readBody(req);
    const workspace = await cleanupWorkspace(cleanupMatch[1], body);
    jsonResponse(res, 200, {
      workspace
    });
    return;
  }

  const openMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/open$/);
  if (openMatch && req.method === 'POST') {
    const body = await readBody(req);
    const result = await openWorkspace(openMatch[1], body);
    jsonResponse(res, 200, {
      ok: true,
      result
    });
    return;
  }

  const workspaceMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)$/);
  if (workspaceMatch && req.method === 'DELETE') {
    const body = await readBody(req);
    const workspace = await purgeWorkspace(workspaceMatch[1], body);
    jsonResponse(res, 200, {
      workspace
    });
    return;
  }

  await serveStatic(req, res, url);
}

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    jsonResponse(res, statusCode, {
      error: error.message,
      workspace: error.workspace || null,
      detail: error.result || null
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`DokanCloud Orchestrator UI running at http://${HOST}:${PORT}`);
  console.log(`Workspace root: ${ROOT}`);
  console.log(`Issue root: ${ISSUE_ROOT}`);
  if (HOST !== '127.0.0.1') {
    console.warn('WARNING: Orchestrator UI is exposed on a non-loopback address with no authentication.');
  }
});
