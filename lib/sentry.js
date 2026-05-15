'use strict';

const { SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECTS } = require('./config');

// Sentry allows 5 requests per second per token.
// We fetch projects sequentially with a 250 ms gap so 7 projects
// take ~1.75 s instead of triggering 429s.
const RATE_LIMIT_DELAY_MS = 250;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sentryHeaders() {
  return {
    Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'DokanCloud-Orchestrator'
  };
}

function normalizeSentryIssue(issue) {
  return {
    id: String(issue.id || ''),
    title: issue.title || '(unknown error)',
    culprit: issue.culprit || '',
    level: issue.level || 'error',
    count: Number(issue.count || 0),
    userCount: Number(issue.userCount || 0),
    firstSeen: issue.firstSeen || null,
    lastSeen: issue.lastSeen || null,
    status: issue.status || 'unresolved',
    isUnhandled: Boolean(issue.isUnhandled),
    permalink: issue.permalink || '',
    project: issue.project?.slug || '',
    type: issue.type || ''
  };
}

async function fetchProjectIssues(project, headers, params) {
  const url = `https://sentry.io/api/0/projects/${encodeURIComponent(SENTRY_ORG)}/${encodeURIComponent(project)}/issues/?${params}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Sentry API error for project "${project}": ${response.status} ${text.slice(0, 200)}`);
  }

  const issues = await response.json();
  return issues.map(normalizeSentryIssue);
}

async function listSentryIssues({ query = 'is:unresolved', limit = 25 } = {}) {
  if (!SENTRY_AUTH_TOKEN) {
    const error = new Error('SENTRY_AUTH_TOKEN is not configured. Add it to your environment to enable Sentry integration.');
    error.statusCode = 503;
    error.unconfigured = true;
    throw error;
  }

  if (!SENTRY_ORG) {
    const error = new Error('SENTRY_ORG is not configured. Add it to your environment to enable Sentry integration.');
    error.statusCode = 503;
    error.unconfigured = true;
    throw error;
  }

  const projects = SENTRY_PROJECTS
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);

  if (!projects.length) {
    const error = new Error('SENTRY_PROJECT is not configured. Add it to your environment to enable Sentry integration.');
    error.statusCode = 503;
    error.unconfigured = true;
    throw error;
  }

  const headers = sentryHeaders();
  const params = new URLSearchParams({ query, limit: String(Math.min(limit, 100)), sort: 'date' });

  // Fetch sequentially to stay within Sentry's 5 req/s rate limit
  const errors = [];
  const allIssues = [];

  for (let i = 0; i < projects.length; i++) {
    if (i > 0) await sleep(RATE_LIMIT_DELAY_MS);

    try {
      const issues = await fetchProjectIssues(projects[i], headers, params);
      allIssues.push(...issues);
    } catch (err) {
      errors.push(err.message || String(err));
    }
  }

  const seen = new Set();
  const issues = allIssues
    .filter(issue => {
      if (seen.has(issue.id)) return false;
      seen.add(issue.id);
      return true;
    })
    .sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));

  return {
    org: SENTRY_ORG,
    projects,
    issues,
    errors
  };
}

module.exports = { listSentryIssues };
