'use strict';

const path = require('node:path');

const { ROOT, RENAMED_REPOS, LEGACY_REPOS_BY_NEW_NAME, REMOVED_REPOS } = require('./config');
const { exists } = require('./utils');

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

function defaultBranchNameFor(issueId, title, slug) {
  const titlePart = slugifyBranchPart(title || slug, 'work');
  const issuePart = issueTokenForBranch(issueId, slug);
  return `fix/${titlePart}-${issuePart}`;
}

function branchNameFor(issueId, title, slug, requestedBranchName) {
  const branch = String(requestedBranchName || '').trim() || defaultBranchNameFor(issueId, title, slug);
  validateBranchName(branch);
  return branch;
}

function validateGitHubRepo(repo) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error(`Invalid GitHub repo: ${repo}`);
  }
}

function canonicalRepoName(repoName) {
  return RENAMED_REPOS[repoName] || repoName;
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

function repoDisplayName(repoName) {
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

module.exports = {
  validateRepoName,
  validateRef,
  sanitizeSlug,
  slugifyBranchPart,
  issueTokenForBranch,
  validateBranchName,
  branchNameFor,
  defaultBranchNameFor,
  validateGitHubRepo,
  canonicalGitHubRepo,
  githubRepoFromRemote,
  repoDisplayName,
  canonicalRepoName,
  resolveRepoDirName
};
