'use strict';

const { SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECTS } = require('./config');

// Sentry allows 5 requests per second per token.
// Sequential fetching with 250 ms gap keeps us well under that.
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

function assertConfigured() {
  if (!SENTRY_AUTH_TOKEN) {
    const err = new Error('SENTRY_AUTH_TOKEN is not configured. Add it to your .env to enable Sentry integration.');
    err.statusCode = 503; err.unconfigured = true; throw err;
  }
  if (!SENTRY_ORG) {
    const err = new Error('SENTRY_ORG is not configured. Add it to your .env to enable Sentry integration.');
    err.statusCode = 503; err.unconfigured = true; throw err;
  }
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

function normalizeFrame(frame) {
  // Sentry returns context as [[lineNo, code], ...] pairs
  const context = Array.isArray(frame.context)
    ? frame.context
    : [];

  return {
    filename: frame.filename || frame.absPath || '',
    lineno: frame.lineNo ?? frame.lineno ?? 0,
    colno: frame.colNo ?? frame.colno ?? null,
    fn: frame.function || '',
    module: frame.module || '',
    inApp: Boolean(frame.inApp),
    context,
    vars: frame.vars && typeof frame.vars === 'object' ? frame.vars : {}
  };
}

function normalizeException(exc) {
  const frames = (exc.stacktrace?.frames || [])
    .map(normalizeFrame)
    .reverse(); // Sentry stores outermost-first; we want innermost-first for display

  return {
    type: exc.type || '',
    value: exc.value || '',
    frames
  };
}

async function fetchProjectIssues(project, headers, params) {
  const url = `https://sentry.io/api/0/projects/${encodeURIComponent(SENTRY_ORG)}/${encodeURIComponent(project)}/issues/?${params}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Sentry API error for project "${project}": ${response.status} ${text.slice(0, 200)}`);
  }

  return (await response.json()).map(normalizeSentryIssue);
}

async function listSentryIssues({ query = 'is:unresolved', limit = 25 } = {}) {
  assertConfigured();

  const projects = SENTRY_PROJECTS.split(',').map(p => p.trim()).filter(Boolean);
  if (!projects.length) {
    const err = new Error('SENTRY_PROJECT is not configured. Add it to your .env to enable Sentry integration.');
    err.statusCode = 503; err.unconfigured = true; throw err;
  }

  const headers = sentryHeaders();
  const params = new URLSearchParams({ query, limit: String(Math.min(limit, 100)), sort: 'date' });

  const errors = [];
  const allIssues = [];

  for (let i = 0; i < projects.length; i++) {
    if (i > 0) await sleep(RATE_LIMIT_DELAY_MS);
    try {
      allIssues.push(...await fetchProjectIssues(projects[i], headers, params));
    } catch (err) {
      errors.push(err.message || String(err));
    }
  }

  const seen = new Set();
  const issues = allIssues
    .filter(issue => { if (seen.has(issue.id)) return false; seen.add(issue.id); return true; })
    .sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));

  return { org: SENTRY_ORG, projects, issues, errors };
}

async function getSentryIssueDetail(issueId) {
  assertConfigured();

  const headers = sentryHeaders();
  const base = `https://sentry.io/api/0/issues/${encodeURIComponent(issueId)}`;

  // Fetch issue metadata and latest event in parallel — same issue ID, no rate-limit concern
  const [issueRes, eventRes] = await Promise.allSettled([
    fetch(`${base}/`, { headers, signal: AbortSignal.timeout(30000) }),
    fetch(`${base}/events/latest/?full=true`, { headers, signal: AbortSignal.timeout(30000) })
  ]);

  let tags = [];
  let exceptions = [];
  let requestInfo = null;
  const errors = [];

  if (issueRes.status === 'fulfilled') {
    if (issueRes.value.ok) {
      const issue = await issueRes.value.json();
      tags = (issue.tags || []).map(t => ({ key: String(t.key || ''), value: String(t.value || '') }));
    } else {
      errors.push(`Issue metadata: ${issueRes.value.status} ${issueRes.value.statusText}`);
    }
  } else {
    errors.push(`Issue metadata: ${issueRes.reason?.message || 'fetch failed'}`);
  }

  if (eventRes.status === 'fulfilled') {
    if (eventRes.value.ok) {
      const event = await eventRes.value.json();
      for (const entry of event.entries || []) {
        if (entry.type === 'exception') {
          exceptions = (entry.data?.values || []).map(normalizeException);
        }
        if (entry.type === 'request') {
          requestInfo = {
            url: entry.data?.url || '',
            method: entry.data?.method || '',
            inferredContentType: entry.data?.inferredContentType || ''
          };
        }
      }
    } else {
      errors.push(`Latest event: ${eventRes.value.status} ${eventRes.value.statusText}`);
    }
  } else {
    errors.push(`Latest event: ${eventRes.reason?.message || 'fetch failed'}`);
  }

  return { issueId, tags, exceptions, requestInfo, errors };
}

module.exports = { listSentryIssues, getSentryIssueDetail };
