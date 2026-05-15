'use strict';

const { ROOT } = require('./config');
const { assertPathInside, exists, run, copyToSystemClipboard } = require('./utils');
const { workspaceMetaForSlug } = require('./workspaces');

const fsSync = require('node:fs');

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

module.exports = {
  shellQuoteForTerminal,
  escapeAppleScriptString,
  openWorkspace,
  openClaudeCodeSession
};
