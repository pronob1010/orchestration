'use strict';

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const { ROOT, REQUEST_LIMIT, MAX_ATTACHMENT_BYTES } = require('./config');

function nowIso() {
  return new Date().toISOString();
}

function exists(filePath) {
  return fsSync.existsSync(filePath);
}

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function textResponse(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function assertPathInside(baseDir, targetPath, label = 'Path') {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);

  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error(`${label} escapes the allowed directory.`);
  }

  return resolvedTarget;
}

function safeJoin(baseDir, requestPath) {
  return assertPathInside(baseDir, path.resolve(baseDir, requestPath), 'Path');
}

function assertIssueRootPath(targetPath, label = 'Workspace path') {
  const { ISSUE_ROOT } = require('./config');
  return assertPathInside(ISSUE_ROOT, targetPath, label);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > REQUEST_LIMIT) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function run(command, args, cwd, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd,
        timeout: options.timeout || 120000,
        maxBuffer: options.maxBuffer || 1024 * 1024 * 12,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0'
        }
      },
      (error, stdout, stderr) => {
        const result = {
          command: [command, ...args].join(' '),
          cwd,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          code: error ? (error.code ?? null) : 0
        };

        if (error) {
          const wrapped = new Error(result.stderr || result.stdout || error.message);
          wrapped.result = result;
          reject(wrapped);
          return;
        }

        resolve(result);
      }
    );
  });
}

async function tryRun(command, args, cwd, options = {}) {
  try {
    return {
      ok: true,
      result: await run(command, args, cwd, options)
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      result: error.result
    };
  }
}

async function git(repoPath, args, options = {}) {
  return run('git', args, repoPath, options);
}

async function tryGit(repoPath, args, options = {}) {
  return tryRun('git', args, repoPath, options);
}

async function readResponseBufferLimited(response) {
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Attachment is too large (${contentLength} bytes).`);
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachment is too large (${buffer.length} bytes).`);
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = Buffer.from(value);
    total += chunk.length;
    if (total > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes.`);
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function copyToSystemClipboard(text) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'darwin') {
      reject(new Error('Server clipboard fallback is only configured for macOS pbcopy.'));
      return;
    }

    const child = spawn('pbcopy', [], {
      cwd: ROOT,
      stdio: ['pipe', 'ignore', 'pipe']
    });
    let stderr = '';

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `pbcopy exited with code ${code}`));
    });
    child.stdin.end(String(text || ''));
  });
}

module.exports = {
  nowIso,
  exists,
  jsonResponse,
  textResponse,
  safeJoin,
  assertPathInside,
  assertIssueRootPath,
  readBody,
  run,
  tryRun,
  git,
  tryGit,
  readResponseBufferLimited,
  copyToSystemClipboard
};
