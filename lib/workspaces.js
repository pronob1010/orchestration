'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { ISSUE_ROOT, DEFAULT_BASE_REF, REMOVED_REPOS } = require('./config');
const { exists, nowIso, assertIssueRootPath, git, tryGit } = require('./utils');
const {
  sanitizeSlug,
  validateRef,
  validateBranchName,
  branchNameFor,
  validateRepoName,
  repoDisplayName,
  resolveRepoDirName
} = require('./validate');
const { classifyRepo, defaultBaseRefFor } = require('./repos');
const { normalizeAttachments, downloadWorkspaceAttachments } = require('./attachments');
const { readJson } = require('./repos');

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

module.exports = {
  metadataPath,
  markdownPath,
  readWorkspaceMeta,
  generateIssueMarkdown,
  writeWorkspaceFiles,
  listWorkspaces,
  normalizeAgents,
  rollbackCreatedWorktrees,
  createWorkspace,
  cleanupWorkspace,
  workspaceMetaForSlug,
  purgeWorkspace
};
