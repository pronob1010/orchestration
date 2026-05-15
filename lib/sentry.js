'use strict';

const { SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECTS } = require('./config');

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

async function listSentryIssues({ query = 'is:unresolved', limit = 50 } = {}) {
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

  const results = await Promise.allSettled(
    projects.map(async project => {
      const url = `https://sentry.io/api/0/projects/${encodeURIComponent(SENTRY_ORG)}/${encodeURIComponent(project)}/issues/?${params}`;
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });

      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new Error(`Sentry API error for project "${project}": ${response.status} ${text.slice(0, 200)}`);
      }

      const issues = await response.json();
      return issues.map(normalizeSentryIssue);
    })
  );

  const errors = results
    .filter(r => r.status === 'rejected')
    .map(r => r.reason?.message || String(r.reason));

  const seen = new Set();
  const issues = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
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
