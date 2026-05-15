#!/usr/bin/env node

'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

// Load .env from the project directory if present (no external dependency needed).
// Shell environment variables always take precedence over .env values.
(function loadDotEnv() {
  const envFile = path.join(__dirname, '.env');
  if (!fsSync.existsSync(envFile)) return;
  try {
    fsSync.readFileSync(envFile, 'utf8')
      .split('\n')
      .forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eq = trimmed.indexOf('=');
        if (eq === -1) return;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
        if (key && !(key in process.env)) process.env[key] = val;
      });
    console.log('Loaded .env');
  } catch (err) {
    console.warn('Could not load .env:', err.message);
  }
}());

const { ROOT, PORT, HOST, DEFAULT_BASE_REF, GITHUB_ISSUES_REPO, MIME_TYPES } = require('./lib/config');
const { jsonResponse, textResponse, safeJoin, readBody, exists, copyToSystemClipboard } = require('./lib/utils');
const { listRepos } = require('./lib/repos');
const { listGitHubIssues, listGitHubPullRequests, createGitHubIssue } = require('./lib/github');
const { listWorkspaces, createWorkspace, cleanupWorkspace, purgeWorkspace } = require('./lib/workspaces');
const { openWorkspace, openClaudeCodeSession } = require('./lib/open');
const { listSentryIssues } = require('./lib/sentry');

const PUBLIC_DIR = path.join(__dirname, 'public');

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
    const { ISSUE_ROOT } = require('./lib/config');
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

  if (url.pathname === '/api/github/issues' && req.method === 'POST') {
    const body = await readBody(req);
    const issue = await createGitHubIssue(body);
    jsonResponse(res, 201, { issue });
    return;
  }

  if (url.pathname === '/api/sentry/issues' && req.method === 'GET') {
    const query = url.searchParams.get('query') || 'is:unresolved';
    jsonResponse(res, 200, await listSentryIssues({ query }));
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
      unconfigured: error.unconfigured || false,
      workspace: error.workspace || null,
      detail: error.result || null
    });
  }
});

server.listen(PORT, HOST, () => {
  const { ISSUE_ROOT } = require('./lib/config');
  console.log(`DokanCloud Orchestrator UI running at http://${HOST}:${PORT}`);
  console.log(`Workspace root: ${ROOT}`);
  console.log(`Issue root: ${ISSUE_ROOT}`);
  if (HOST !== '127.0.0.1') {
    console.warn('WARNING: Orchestrator UI is exposed on a non-loopback address with no authentication.');
  }
});
