'use strict';

const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const ISSUE_ROOT = path.resolve(process.env.ISSUE_WORKSPACE_ROOT || path.join(ROOT, '..', 'DokanCloud-issues'));
const PORT = Number(process.env.ORCHESTRATOR_PORT || 4177);
const HOST = process.env.ORCHESTRATOR_HOST || '127.0.0.1';
const DEFAULT_BASE_REF = process.env.ORCHESTRATOR_BASE_REF || 'origin/develop';
const GITHUB_ISSUES_REPO = process.env.GITHUB_ISSUES_REPO || 'getdokan/project';
const GITHUB_PR_REPOS = process.env.GITHUB_PR_REPOS || process.env.ORCHESTRATOR_PR_REPOS || '';
const REQUEST_LIMIT = 1024 * 1024;
const ATTACHMENT_LIMIT = 20;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN || '';
const SENTRY_ORG = process.env.SENTRY_ORG || '';
const SENTRY_PROJECTS = process.env.SENTRY_PROJECT || process.env.SENTRY_PROJECTS || '';

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

module.exports = {
  ROOT,
  ISSUE_ROOT,
  PORT,
  HOST,
  DEFAULT_BASE_REF,
  GITHUB_ISSUES_REPO,
  GITHUB_PR_REPOS,
  REQUEST_LIMIT,
  ATTACHMENT_LIMIT,
  MAX_ATTACHMENT_BYTES,
  SENTRY_AUTH_TOKEN,
  SENTRY_ORG,
  SENTRY_PROJECTS,
  RENAMED_REPOS,
  LEGACY_REPOS_BY_NEW_NAME,
  REMOVED_REPOS,
  IGNORED_ROOT_DIRS,
  MIME_TYPES
};
