'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { ATTACHMENT_LIMIT } = require('./config');
const { assertIssueRootPath, readResponseBufferLimited } = require('./utils');

function normalizeAttachmentUrl(value) {
  const raw = String(value || '')
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/[),.;]+$/g, '');

  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];

  const seen = new Set();
  const normalized = [];

  for (const item of attachments) {
    if (normalized.length >= ATTACHMENT_LIMIT) break;

    const url = normalizeAttachmentUrl(typeof item === 'string' ? item : item?.url);
    if (!url || seen.has(url)) continue;

    seen.add(url);
    normalized.push({
      url,
      alt: String(typeof item === 'object' && item ? item.alt || item.label || '' : '')
        .trim()
        .slice(0, 160)
    });
  }

  return normalized;
}

function attachmentHeaders(url) {
  const headers = {
    Accept: 'image/*,application/octet-stream,*/*;q=0.8',
    'User-Agent': 'DokanCloud-Orchestrator'
  };

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const isGitHubHost = hostname === 'github.com' || hostname.endsWith('.github.com') || hostname.endsWith('githubusercontent.com');
    if (isGitHubHost && process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
  } catch {
    // URL was already normalized by the caller.
  }

  return headers;
}

function extensionForContentType(contentType) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  const map = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg'
  };

  return map[type] || '';
}

function extensionForUrl(url) {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (/^\.(png|jpe?g|gif|webp|svg)$/.test(ext)) return ext;
  } catch {
    return '';
  }

  return '';
}

function attachmentFilename(attachment, index, contentType) {
  const ext = extensionForContentType(contentType) || extensionForUrl(attachment.url) || '.bin';
  return `attachment-${String(index + 1).padStart(2, '0')}${ext}`;
}

async function downloadAttachment(issuePath, attachment, index) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(attachment.url, {
      headers: attachmentHeaders(attachment.url),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    if (!contentType.startsWith('image/') && !contentType.startsWith('application/octet-stream')) {
      throw new Error(`Attachment response is not an image (${contentType}).`);
    }

    const buffer = await readResponseBufferLimited(response);
    const filename = attachmentFilename(attachment, index, contentType);
    const attachmentDir = assertIssueRootPath(path.join(issuePath, 'attachments'), 'Attachment path');
    const filePath = assertIssueRootPath(path.join(attachmentDir, filename), 'Attachment file');

    await fs.mkdir(attachmentDir, { recursive: true });
    await fs.writeFile(filePath, buffer);

    return {
      ...attachment,
      status: 'saved',
      filename,
      relativePath: `attachments/${filename}`,
      path: filePath,
      contentType,
      size: buffer.length
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadWorkspaceAttachments(issuePath, attachments) {
  const records = [];

  for (const [index, attachment] of attachments.entries()) {
    try {
      records.push(await downloadAttachment(issuePath, attachment, index));
    } catch (error) {
      records.push({
        ...attachment,
        status: 'failed',
        error: error.message
      });
    }
  }

  return records;
}

module.exports = {
  normalizeAttachmentUrl,
  normalizeAttachments,
  attachmentHeaders,
  downloadAttachment,
  downloadWorkspaceAttachments,
  extensionForContentType,
  extensionForUrl,
  attachmentFilename
};
