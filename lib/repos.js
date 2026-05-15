'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { ROOT, IGNORED_ROOT_DIRS } = require('./config');
const { exists, tryGit } = require('./utils');
const { validateRepoName, validateRef, repoDisplayName } = require('./validate');

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

module.exports = {
  readJson,
  detectPackageManager,
  buildNodeChecks,
  classifyRepo,
  defaultBaseRefFor,
  repoSummary,
  listRepos
};
