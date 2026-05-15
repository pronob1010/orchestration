'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { ROOT, GITHUB_ISSUES_REPO, GITHUB_PR_REPOS, IGNORED_ROOT_DIRS, LEGACY_REPOS_BY_NEW_NAME } = require('./config');
const { exists, run, tryRun, tryGit } = require('./utils');
const {
  validateGitHubRepo,
  canonicalGitHubRepo,
  githubRepoFromRemote,
  repoDisplayName,
  canonicalRepoName
} = require('./validate');

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

async function createGitHubIssue(payload) {
  const repo = String(payload.repo || GITHUB_ISSUES_REPO).trim();
  validateGitHubRepo(repo);

  const title = String(payload.title || '').trim();
  if (!title) {
    const error = new Error('Issue title is required.');
    error.statusCode = 400;
    throw error;
  }

  const body = String(payload.body || '').trim();
  const labels = Array.isArray(payload.labels) ? payload.labels.map(String).filter(Boolean) : [];

  // Try gh CLI first
  const args = ['issue', 'create', '--repo', repo, '--title', title, '--json', 'number,url,title'];
  if (body) args.push('--body', body);
  for (const label of labels) args.push('--label', label);

  const ghResult = await tryRun('gh', args, ROOT, { timeout: 60000 });
  if (ghResult.ok) {
    const issue = JSON.parse(ghResult.result.stdout);
    return { repo, number: issue.number, title: issue.title, url: issue.url };
  }

  // Fall back to REST API
  if (!process.env.GITHUB_TOKEN) {
    throw new Error(`Failed to create issue via gh CLI: ${ghResult.error}. Set GITHUB_TOKEN to use the REST API fallback.`);
  }

  const [owner, repoName] = repo.split('/');
  const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/issues`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'DokanCloud-Orchestrator'
    },
    body: JSON.stringify({ title, body, labels })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`GitHub API error ${response.status}: ${err.message || response.statusText}`);
  }

  const issue = await response.json();
  return { repo, number: issue.number, title: issue.title, url: issue.html_url };
}

module.exports = {
  normalizeGitHubUser,
  normalizeGitHubLabels,
  normalizeGitHubUsers,
  normalizeReviewDecision,
  normalizePullRequest,
  githubHeaders,
  configuredPullRequestRepos,
  listPullRequestsWithGh,
  listPullRequestsWithApi,
  listPullRequestsForRepo,
  listGitHubPullRequests,
  normalizeIssue,
  currentGitHubUser,
  listGitHubIssues,
  createGitHubIssue
};
