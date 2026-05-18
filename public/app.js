const state = {
  health: null,
  issues: [],
  issuesSource: '',
  issuesRepo: '',
  viewer: null,
  pullRequests: [],
  pullRequestErrors: [],
  pullRequestSource: '',
  pullRequestsLoaded: false,
  pullRequestsLoading: false,
  repos: [],
  workspaces: [],
  selectedRepos: new Set(),
  suggestedRepos: new Set(),
  selectedIssueNumber: null,
  selectedPullRequestKey: null,
  issueInsightsByKey: {},
  branchNameTouched: false,
  issueFilter: '',
  assigneeFilter: 'all',
  prFilter: '',
  prRepoFilter: 'all',
  prAuthorFilter: 'all',
  prReviewFilter: 'all',
  filter: '',
  busy: false,
  sentryIssues: [],
  sentryErrors: [],
  sentryLoaded: false,
  sentryLoading: false,
  sentryError: null,
  sentryUnconfigured: false,
  sentryFilter: '',
  sentryProjectFilter: 'all',
  sentryLevelFilter: 'all',
  selectedSentryId: null,
  sentryDetailCache: {},
  sentryDetailLoading: new Set()
};

const els = {
  serverStatus: document.getElementById('serverStatus'),
  refreshButton: document.getElementById('refreshButton'),
  themeToggle: document.getElementById('themeToggle'),
  themeIcon: document.getElementById('themeIcon'),
  viewTabs: document.querySelectorAll('[data-view-tab]'),
  viewPanels: document.querySelectorAll('[data-view-panel]'),
  viewLinks: document.querySelectorAll('[data-view-link]'),
  workspaceForm: document.getElementById('workspaceForm'),
  issueId: document.getElementById('issueId'),
  issueTitle: document.getElementById('issueTitle'),
  branchName: document.getElementById('branchName'),
  baseRef: document.getElementById('baseRef'),
  fetchLatest: document.getElementById('fetchLatest'),
  issueSearch: document.getElementById('issueSearch'),
  issueList: document.getElementById('issueList'),
  issueCount: document.getElementById('issueCount'),
  refreshIssuesButton: document.getElementById('refreshIssuesButton'),
  assigneeFilter: document.getElementById('assigneeFilter'),
  issueDetail: document.getElementById('issueDetail'),
  issueInsights: document.getElementById('issueInsights'),
  applySuggestionsButton: document.getElementById('applySuggestionsButton'),
  clearSuggestedButton: document.getElementById('clearSuggestedButton'),
  workerBrief: document.getElementById('workerBrief'),
  copyBriefButton: document.getElementById('copyBriefButton'),
  repoSearch: document.getElementById('repoSearch'),
  repoList: document.getElementById('repoList'),
  selectedCount: document.getElementById('selectedCount'),
  selectDirtyButton: document.getElementById('selectDirtyButton'),
  selectAllButton: document.getElementById('selectAllButton'),
  clearSelectionButton: document.getElementById('clearSelectionButton'),
  createButton: document.getElementById('createButton'),
  creationLog: document.getElementById('creationLog'),
  createStatus: document.getElementById('createStatus'),
  commandPreview: document.getElementById('commandPreview'),
  copyCommandsButton: document.getElementById('copyCommandsButton'),
  reviewPrimaryPr: document.getElementById('reviewPrimaryPr'),
  reviewRelatedPrs: document.getElementById('reviewRelatedPrs'),
  reviewContext: document.getElementById('reviewContext'),
  reviewChecks: document.querySelectorAll('[data-review-check]'),
  pullRequestList: document.getElementById('pullRequestList'),
  pullRequestCount: document.getElementById('pullRequestCount'),
  refreshPullRequestsButton: document.getElementById('refreshPullRequestsButton'),
  pullRequestErrors: document.getElementById('pullRequestErrors'),
  prSearch: document.getElementById('prSearch'),
  prRepoFilter: document.getElementById('prRepoFilter'),
  prAuthorFilter: document.getElementById('prAuthorFilter'),
  prReviewFilter: document.getElementById('prReviewFilter'),
  prReviewPrompt: document.getElementById('prReviewPrompt'),
  copyPrReviewPromptButton: document.getElementById('copyPrReviewPromptButton'),
  openClaudeCodeReviewButton: document.getElementById('openClaudeCodeReviewButton'),
  workspaceList: document.getElementById('workspaceList'),
  workspaceCount: document.getElementById('workspaceCount'),
  toastHost: document.getElementById('toastHost'),
  agentOrchestrator: document.getElementById('agentOrchestrator'),
  agentWorker: document.getElementById('agentWorker'),
  agentObserver: document.getElementById('agentObserver'),
  agentStandards: document.getElementById('agentStandards'),
  myListForm: document.getElementById('myListForm'),
  myListTitle: document.getElementById('myListTitle'),
  myListBody: document.getElementById('myListBody'),
  myListLabels: document.getElementById('myListLabels'),
  myListAddButton: document.getElementById('myListAddButton'),
  myListItems: document.getElementById('myListItems'),
  myListCount: document.getElementById('myListCount'),
  myListSearch: document.getElementById('myListSearch'),
  sentryTab: document.getElementById('sentryTab'),
  sentryLoadButton: document.getElementById('sentryLoadButton'),
  sentrySearch: document.getElementById('sentrySearch'),
  sentryProjectFilter: document.getElementById('sentryProjectFilter'),
  sentryLevelFilter: document.getElementById('sentryLevelFilter'),
  sentryList: document.getElementById('sentryList'),
  sentryCount: document.getElementById('sentryCount'),
  sentryDetail: document.getElementById('sentryDetail')
};

// ── Theme ─────────────────────────────────────────────────────────────────────

const SUN_ICON = `<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />`;
const MOON_ICON = `<path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />`;
const CHECK_ICON = `<path d="m5 13 4 4L19 7" />`;
const COPY_ICON = `<rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />`;

const REPO_DISPLAY_NAMES = {
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

function isDarkMode() {
  const stored = localStorage.getItem('theme');
  if (stored === 'dark') return true;
  if (stored === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  els.themeIcon.innerHTML = dark ? MOON_ICON : SUN_ICON;
  els.themeToggle.title = dark ? 'Switch to light mode (T)' : 'Switch to dark mode (T)';
}

function toggleTheme() {
  const next = !isDarkMode();
  localStorage.setItem('theme', next ? 'dark' : 'light');
  applyTheme(next);
}

applyTheme(isDarkMode());

// ── View tabs ─────────────────────────────────────────────────────────────────

const VALID_VIEWS = new Set(['issues', 'pull-requests', 'sentry', 'my-list']);

function setActiveView(view) {
  const nextView = VALID_VIEWS.has(view) ? view : 'issues';

  els.viewTabs.forEach(tab => {
    const isActive = tab.dataset.viewTab === nextView;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  els.viewPanels.forEach(panel => {
    const isActive = panel.dataset.viewPanel === nextView;
    panel.classList.toggle('is-active', isActive);
    panel.hidden = !isActive;
  });

  els.viewLinks.forEach(link => {
    link.classList.toggle('is-active', link.dataset.viewLink === nextView);
  });

  if (nextView === 'pull-requests') ensurePullRequestsLoaded();
  if (nextView === 'sentry') ensureSentryLoaded();
}

function viewFromHash(hash) {
  if (hash === '#pull-requests-view' || hash === '#pr-review') return 'pull-requests';
  if (hash === '#sentry-view') return 'sentry';
  if (hash === '#my-list-view') return 'my-list';
  return 'issues';
}

setActiveView(viewFromHash(window.location.hash));

// ── Utilities ─────────────────────────────────────────────────────────────────

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ── Lightweight markdown → HTML (handles only the subset we generate) ─────────
function renderMarkdown(md) {
  if (!md) return '';
  const lines = md.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block ```lang … ```
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      out.push(`<pre class="md-code-block" data-lang="${escapeHtml(lang)}"><code>${codeLines.join('\n')}</code></pre>`);
      i++; // skip closing ```
      continue;
    }

    // ## H2
    if (/^## /.test(line)) {
      out.push(`<h3 class="md-h2">${inlineMarkdown(line.slice(3))}</h3>`);
      i++; continue;
    }

    // ### H3
    if (/^### /.test(line)) {
      out.push(`<h4 class="md-h3">${inlineMarkdown(line.slice(4))}</h4>`);
      i++; continue;
    }

    // Bullet list — collect consecutive - lines
    if (/^- /.test(line)) {
      const items = [];
      while (i < lines.length && /^- /.test(lines[i])) {
        items.push(`<li>${inlineMarkdown(lines[i].slice(2))}</li>`);
        i++;
      }
      out.push(`<ul class="md-list">${items.join('')}</ul>`);
      continue;
    }

    // Blank line → paragraph break (swallow consecutive blanks)
    if (!line.trim()) {
      i++;
      continue;
    }

    // Regular paragraph line — collect until blank / heading / list / fence
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4} |```|- )/.test(lines[i])
    ) {
      paraLines.push(inlineMarkdown(lines[i]));
      i++;
    }
    if (paraLines.length) out.push(`<p class="md-p">${paraLines.join(' ')}</p>`);
  }

  return out.join('');
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    // **bold**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // `inline code`
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
}

function issueSlug(value) {
  const raw = String(value || '').trim().toLowerCase();
  const slug = raw
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);

  if (!slug) throw new Error('Issue ID is required.');
  if (/^\d+$/.test(slug)) return `issue-${slug}`;
  return slug.startsWith('issue-') ? slug : `issue-${slug}`;
}

function slugifyBranchPart(value, fallback = 'work') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);

  return slug || fallback;
}

function issueTokenForBranch(issueId) {
  const match = String(issueId || '').match(/\d+/);
  if (match) return `issue-${match[0]}`;
  if (!String(issueId || '').trim()) return 'issue';
  return slugifyBranchPart(issueSlug(issueId), 'issue');
}

function generatedBranchName() {
  const issueId = els.issueId.value.trim();
  const title = els.issueTitle.value.trim();
  return `fix/${slugifyBranchPart(title || issueId, 'work')}-${issueTokenForBranch(issueId)}`;
}

function currentBranchName() {
  return els.branchName.value.trim() || generatedBranchName();
}

function syncBranchName(force = false) {
  if (!force && state.branchNameTouched) return;
  els.branchName.value = generatedBranchName();
}

function shellQuote(value) {
  const text = String(value || '');
  if (/^[A-Za-z0-9_./:-]+$/.test(text)) return text;
  return `'${text.replaceAll("'", "'\\''")}'`;
}

function toast(message, type = 'info') {
  const node = document.createElement('div');
  node.className = `toast ${type === 'error' ? 'is-error' : ''} ${type === 'success' ? 'is-success' : ''}`;
  node.textContent = message;
  els.toastHost.append(node);
  setTimeout(() => node.remove(), 4200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || response.statusText);
    error.payload = payload;
    throw error;
  }
  return payload;
}

function copyWithFeedback(button, getText) {
  return async () => {
    const text = getText();
    try {
      await navigator.clipboard.writeText(text);
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${CHECK_ICON}</svg>`;
      button.classList.add('did-copy');
      setTimeout(() => {
        button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${COPY_ICON}</svg>`;
        button.classList.remove('did-copy');
      }, 1800);
    } catch {
      toast('Clipboard copy failed.', 'error');
    }
  };
}

// ── Collapsibles ──────────────────────────────────────────────────────────────

document.querySelectorAll('.collapse-toggle').forEach(btn => {
  const targetId = btn.dataset.collapse;
  const body = document.getElementById(targetId);
  const section = btn.closest('section, .surface');

  btn.addEventListener('click', () => {
    const collapsed = section.classList.toggle('is-collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    body.setAttribute('aria-hidden', String(collapsed));
  });

  btn.setAttribute('aria-expanded', 'true');
});

// ── Filters ───────────────────────────────────────────────────────────────────

function statusClass(status) {
  if (status === 'failed') return 'is-error';
  if (status === 'creating') return 'is-warn';
  if (status === 'cleaned' || status === 'untracked') return 'is-muted';
  return '';
}

function repoDisplayName(repoOrName) {
  if (typeof repoOrName === 'object' && repoOrName) {
    return repoOrName.displayName || REPO_DISPLAY_NAMES[repoOrName.name] || repoOrName.name;
  }

  const name = String(repoOrName || '');
  const match = state.repos.find(repo => repo.name === name || repo.displayName === name);
  return match?.displayName || REPO_DISPLAY_NAMES[name] || name;
}

function repoMatches(repo) {
  const query = state.filter.trim().toLowerCase();
  if (!query) return true;
  return [repo.name, repoDisplayName(repo), repo.branch, repo.remote, ...(repo.tech || [])].join(' ').toLowerCase().includes(query);
}

function issueMatches(issue) {
  const query = state.issueFilter.trim().toLowerCase();
  const textMatch = !query || [`#${issue.number}`, issue.title, issue.body, ...(issue.labels || []), ...(issue.assignees || [])].join(' ').toLowerCase().includes(query);
  if (!textMatch) return false;

  if (state.assigneeFilter === 'mine') {
    if (!state.viewer) return true;
    return (issue.assignees || []).includes(state.viewer);
  }
  if (state.assigneeFilter === 'unassigned') {
    return !issue.assignees || issue.assignees.length === 0;
  }
  return true;
}

function pullRequestKey(pr) {
  return `${pr.repo}#${pr.number}`;
}

function pullRequestRef(pr) {
  return pr?.url || `${pr.repo}#${pr.number}`;
}

function normalizedReviewValue(value) {
  return String(value || 'unknown').toLowerCase();
}

function pullRequestMatches(pr) {
  const query = state.prFilter.trim().toLowerCase();
  const searchable = [
    `#${pr.number}`,
    pr.repo,
    pr.localRepo,
    pr.displayName,
    pr.title,
    pr.author,
    pr.baseRefName,
    pr.headRefName,
    pr.headOwner,
    pr.reviewDecision,
    ...(pr.labels || []),
    ...(pr.assignees || [])
  ].join(' ').toLowerCase();

  if (query && !searchable.includes(query)) return false;
  if (state.prRepoFilter !== 'all' && pr.repo !== state.prRepoFilter && pr.localRepo !== state.prRepoFilter) return false;
  if (state.prAuthorFilter !== 'all' && pr.author !== state.prAuthorFilter) return false;

  const review = normalizedReviewValue(pr.reviewDecision);
  if (state.prReviewFilter === 'ready' && pr.isDraft) return false;
  if (state.prReviewFilter === 'draft' && !pr.isDraft) return false;
  if (state.prReviewFilter === 'approved' && review !== 'approved') return false;
  if (state.prReviewFilter === 'changes_requested' && review !== 'changes_requested') return false;
  if (state.prReviewFilter === 'review_required' && review !== 'review_required' && review !== 'unknown') return false;

  return true;
}

function formatDate(value) {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatReviewDecision(value) {
  const normalized = normalizedReviewValue(value);
  if (normalized === 'changes_requested') return 'changes requested';
  if (normalized === 'review_required') return 'review required';
  if (normalized === 'approved') return 'approved';
  if (normalized === 'draft') return 'draft';
  return 'unknown';
}

// ── Repo suggestion rules ─────────────────────────────────────────────────────

const REPO_SUGGESTION_RULES = [
  { repos: ['flycom-dashboard', 'flycom-engine'], keywords: ['dashboard', 'admin', 'vendor', 'seller', 'settings', 'onboard', 'registration', 'reset password', 'support menu'] },
  { repos: ['flycom-storefront', 'flycom-engine', 'flycom-content-service'], keywords: ['storefront', 'checkout', 'cart', 'product details', '404', 'cookies', 'guest', 'site coming soon'] },
  { repos: ['themes', 'flycom-storefront', 'flycom-content-service'], keywords: ['theme', 'lumen', 'brand logo', 'page builder', 'theme developer'] },
  { repos: ['flycom-engine', 'flycom-storefront'], keywords: ['tax', 'vat', 'avalara', 'taxjar', 'invoice', 'fatoora', 'zatca'] },
  { repos: ['flycom-payment-service', 'flycom-engine', 'flycom-app'], keywords: ['payment', 'billing', 'subscription', 'stripe', 'paypal', 'bkash', 'recurring', 'plan'] },
  { repos: ['flycom-auth-service', 'backend-common', 'flycom-dashboard', 'flycom-engine'], keywords: ['login', 'auth', 'authentication', 'token', 'password', 'sign-in', 'signup', 'logout', 'session'] },
  { repos: ['flycom-engine', 'flycom-dashboard', 'flycom-storefront', 'flycom-content-service'], keywords: ['product', 'catalog', 'csv', 'import', 'export', 'inventory', 'media', 'image', 'attribute', 'digital product'] },
  { repos: ['flycom-engine', 'flycom-integration-service'], keywords: ['shipping', 'pathao', 'redx', 'steadfast', 'courier', 'shipment'] },
  { repos: ['flycom-domain-service', 'flycom-app', 'flycom-engine'], keywords: ['domain', 'verification', 'custom domain'] },
  { repos: ['flycom-dashboard', 'flycom-storefront', 'flycom-engine'], keywords: ['translation', 'language', 'locale', 'currency'] },
  { repos: ['flycom-engine', 'flycom-dashboard'], keywords: ['ai', 'content generation'] },
  { repos: ['flycom-integration-service', 'flycom-engine', 'flycom-app'], keywords: ['google sheet', 'webhook', 'event', 'rabbitmq', 'sync'] }
];

function selectedIssue() {
  return state.issues.find(issue => issue.number === state.selectedIssueNumber) || null;
}

function issueInsightKey(issue = selectedIssue()) {
  if (issue) return `issue:${issue.repo || state.issuesRepo || 'project'}#${issue.number}`;

  const rawIssueId = els.issueId?.value.trim();
  return rawIssueId ? `manual:${rawIssueId}` : 'manual';
}

function saveIssueInsights() {
  if (!els.issueInsights) return;
  state.issueInsightsByKey[issueInsightKey()] = els.issueInsights.value;
}

function loadIssueInsights(issue = selectedIssue()) {
  if (!els.issueInsights) return;
  els.issueInsights.value = state.issueInsightsByKey[issueInsightKey(issue)] || '';
}

function currentIssueInsights() {
  return els.issueInsights?.value.trim() || '';
}

function resolveAvailableRepoName(candidate) {
  const wanted = String(candidate || '').toLowerCase();
  const match = state.repos.find(repo => {
    const names = [repo.name, repo.displayName, REPO_DISPLAY_NAMES[repo.name]].filter(Boolean);
    return names.some(name => name.toLowerCase() === wanted);
  });

  return match?.name || null;
}

function issueSearchText(issue) {
  return [issue.title, issue.body, ...(issue.labels || [])].join(' ').toLowerCase();
}

function repoSuggestionsFor(issue) {
  if (!issue) return [];

  const text = issueSearchText(issue);
  const scores = new Map();

  for (const rule of REPO_SUGGESTION_RULES) {
    const hits = rule.keywords.filter(keyword => text.includes(keyword.toLowerCase())).length;
    if (!hits) continue;
    for (const repo of rule.repos) {
      const availableRepo = resolveAvailableRepoName(repo);
      if (!availableRepo) continue;
      scores.set(availableRepo, (scores.get(availableRepo) || 0) + hits);
    }
  }

  for (const repo of state.repos) {
    const names = [repo.name, repoDisplayName(repo)].filter(Boolean);
    if (names.some(name => text.includes(name.toLowerCase()))) {
      scores.set(repo.name, (scores.get(repo.name) || 0) + 4);
    }
  }

  const defaultRepo = resolveAvailableRepoName('flycom-engine');
  if (scores.size === 0 && defaultRepo) scores.set(defaultRepo, 1);

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || repoDisplayName(a[0]).localeCompare(repoDisplayName(b[0])))
    .map(([repo]) => repo);
}

function applySuggestedRepos(issue) {
  const suggestions = repoSuggestionsFor(issue);
  state.suggestedRepos = new Set(suggestions);
  suggestions.forEach(repo => state.selectedRepos.add(repo));
}

function stripMarkdown(markdown) {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[#>*_~-]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Render helpers ────────────────────────────────────────────────────────────

function repoTagMarkup(repo) {
  const dirtyTag = repo.dirtyCount > 0
    ? `<span class="tag is-dirty">${repo.dirtyCount} dirty</span>`
    : '<span class="tag is-clean">clean</span>';
  const techTags = (repo.tech || []).slice(0, 3).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`);
  return [dirtyTag, ...techTags].join('');
}

function repoSuggestionTag(repo) {
  return state.suggestedRepos.has(repo.name) ? '<span class="tag is-blue">suggested</span>' : '';
}

function renderRepos() {
  const repos = state.repos.filter(repoMatches);
  els.selectedCount.textContent = `${state.selectedRepos.size} repos`;

  if (!repos.length) {
    els.repoList.innerHTML = '<div class="empty-state">No repos match the current filter.</div>';
    return;
  }

  els.repoList.innerHTML = repos.map(repo => {
    const checked = state.selectedRepos.has(repo.name) ? 'checked' : '';
    const displayName = repoDisplayName(repo);
    return `
      <label class="repo-row">
        <input type="checkbox" data-repo="${escapeHtml(repo.name)}" ${checked} />
        <span>
          <p class="repo-name">${escapeHtml(displayName)}</p>
          <p class="repo-branch">${escapeHtml(repo.name)} · ${escapeHtml(repo.branch)} · ${escapeHtml(repo.packageManager || 'no package manager')}</p>
          <p class="repo-path">${escapeHtml(repo.path)}</p>
        </span>
        <span class="repo-tags">${repoSuggestionTag(repo)}${repoTagMarkup(repo)}</span>
      </label>
    `;
  }).join('');
}

function renderIssues() {
  const issues = state.issues.filter(issueMatches);
  const countLabel = state.issuesSource ? `${state.issues.length} open · ${state.issuesSource}` : `${state.issues.length} open`;
  els.issueCount.textContent = countLabel;
  els.issueCount.className = 'status-pill is-muted';

  const mineOption = els.assigneeFilter.querySelector('option[value="mine"]');
  if (mineOption && state.viewer) mineOption.textContent = `Mine (${state.viewer})`;

  if (!issues.length) {
    els.issueList.innerHTML = '<div class="empty-state">No open issues match the current filter.</div>';
    return;
  }

  els.issueList.innerHTML = issues.map(issue => {
    const selected = state.selectedIssueNumber === issue.number ? 'is-selected' : '';
    const labels = (issue.labels || []).slice(0, 3).map(label => `<span class="tag">${escapeHtml(label)}</span>`).join('');
    const assigneeText = issue.assignees && issue.assignees.length ? issue.assignees.join(', ') : 'unassigned';
    return `
      <button class="issue-row ${selected}" type="button" data-issue-number="${escapeHtml(issue.number)}">
        <span>
          <p class="issue-title">#${escapeHtml(issue.number)} ${escapeHtml(issue.title)}</p>
          <p class="issue-subtitle">${escapeHtml(assigneeText)} · updated ${escapeHtml(formatDate(issue.updatedAt))}</p>
        </span>
        <span class="repo-tags">
          <span class="tag is-blue">open</span>
          ${labels}
        </span>
      </button>
    `;
  }).join('');
}

function setSelectOptions(select, options, selectedValue) {
  const current = selectedValue || select.value || 'all';
  select.innerHTML = options.map(option => `
    <option value="${escapeHtml(option.value)}" ${option.value === current ? 'selected' : ''}>${escapeHtml(option.label)}</option>
  `).join('');

  if (![...select.options].some(option => option.value === current)) {
    select.value = 'all';
  }

  return select.value;
}

function renderPullRequestFilters() {
  const repoOptions = [
    { value: 'all', label: 'All repos' },
    ...[...new Set(state.pullRequests.map(pr => pr.repo).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .map(repo => {
        const pr = state.pullRequests.find(item => item.repo === repo);
        return { value: repo, label: pr?.displayName || repo };
      })
  ];
  const authorOptions = [
    { value: 'all', label: 'All authors' },
    ...[...new Set(state.pullRequests.map(pr => pr.author).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .map(author => ({ value: author, label: author }))
  ];

  state.prRepoFilter = setSelectOptions(els.prRepoFilter, repoOptions, state.prRepoFilter);
  state.prAuthorFilter = setSelectOptions(els.prAuthorFilter, authorOptions, state.prAuthorFilter);
}

function pullRequestReviewTag(pr) {
  const review = normalizedReviewValue(pr.reviewDecision);
  if (pr.isDraft || review === 'draft') return '<span class="tag is-muted">draft</span>';
  if (review === 'approved') return '<span class="tag is-clean">approved</span>';
  if (review === 'changes_requested') return '<span class="tag is-dirty">changes requested</span>';
  if (review === 'review_required') return '<span class="tag is-blue">review required</span>';
  return '<span class="tag">unknown</span>';
}

function renderPullRequestErrors() {
  if (!state.pullRequestErrors.length) {
    els.pullRequestErrors.hidden = true;
    els.pullRequestErrors.innerHTML = '';
    return;
  }

  els.pullRequestErrors.hidden = false;
  els.pullRequestErrors.innerHTML = state.pullRequestErrors.slice(0, 4).map(error => `
    <p>${escapeHtml(error.repo)}: ${escapeHtml(error.error)}</p>
  `).join('');
}

function renderPullRequests() {
  if (!els.pullRequestList) return;

  renderPullRequestFilters();
  renderPullRequestErrors();

  if (state.pullRequestsLoading) {
    els.pullRequestCount.textContent = 'Loading';
    els.pullRequestCount.className = 'status-pill is-warn';
    els.pullRequestList.innerHTML = '<div class="empty-state">Loading open pull requests...</div>';
    return;
  }

  if (!state.pullRequestsLoaded) {
    els.pullRequestCount.textContent = 'Not loaded';
    els.pullRequestCount.className = 'status-pill is-muted';
    return;
  }

  const pullRequests = state.pullRequests.filter(pullRequestMatches);
  const source = state.pullRequestSource ? ` · ${state.pullRequestSource}` : '';
  els.pullRequestCount.textContent = `${pullRequests.length}/${state.pullRequests.length} open${source}`;
  els.pullRequestCount.className = state.pullRequestErrors.length ? 'status-pill is-warn' : 'status-pill is-muted';

  if (!pullRequests.length) {
    els.pullRequestList.innerHTML = '<div class="empty-state">No open pull requests match the current filters.</div>';
    return;
  }

  const relatedRefs = new Set(splitReviewRefs(els.reviewRelatedPrs?.value));
  els.pullRequestList.innerHTML = pullRequests.map(pr => {
    const key = pullRequestKey(pr);
    const selected = state.selectedPullRequestKey === key ? 'is-selected' : '';
    const isRelated = relatedRefs.has(pullRequestRef(pr));
    const labels = (pr.labels || []).slice(0, 2).map(label => `<span class="tag">${escapeHtml(label)}</span>`).join('');
    const branch = [pr.headOwner, pr.headRefName].filter(Boolean).join(':') || pr.headRefName || 'unknown branch';
    const displayName = pr.displayName || pr.repo;
    return `
      <article class="pr-row ${selected}">
        <button class="pr-main-button" type="button" data-pr-primary="${escapeHtml(key)}">
          <span>
            <p class="pr-title">${escapeHtml(displayName)} #${escapeHtml(pr.number)} · ${escapeHtml(pr.title)}</p>
            <p class="pr-subtitle">${escapeHtml(pr.author || 'unknown')} · ${escapeHtml(branch)} → ${escapeHtml(pr.baseRefName || 'base')} · updated ${escapeHtml(formatDate(pr.updatedAt))}</p>
          </span>
          <span class="repo-tags">
            ${pullRequestReviewTag(pr)}
            ${labels}
          </span>
        </button>
        <button class="secondary-button pr-related-button ${isRelated ? 'is-active' : ''}" type="button" data-pr-related="${escapeHtml(key)}" title="${isRelated ? 'Double-click to remove from related PRs' : 'Click to add as related PR'}">${isRelated ? 'Added' : 'Related'}</button>
      </article>
    `;
  }).join('');
}

function renderIssueDetail() {
  const issue = selectedIssue();

  if (!issue) {
    els.issueDetail.innerHTML = '<div class="empty-state">No issue selected.</div>';
    els.workerBrief.textContent = 'Select an issue to generate a worker brief.';
    if (els.issueInsights) els.issueInsights.placeholder = 'Add manual context before creating a workspace.';
    return;
  }

  const suggestions = repoSuggestionsFor(issue);
  const body = stripMarkdown(issue.body).slice(0, 1400);
  const labels = (issue.labels || []).map(label => `<span class="tag">${escapeHtml(label)}</span>`).join('');
  const suggestedTags = suggestions.length
    ? suggestions.map(repo => `<span class="tag is-blue">${escapeHtml(repoDisplayName(repo))}</span>`).join('')
    : '<span class="tag is-muted">none</span>';
  const assignees = issue.assignees && issue.assignees.length ? issue.assignees.join(', ') : 'unassigned';

  els.issueDetail.innerHTML = `
    <div class="issue-detail-card">
      <div>
        <p class="issue-title">#${escapeHtml(issue.number)} ${escapeHtml(issue.title)}</p>
        <p class="issue-subtitle">${escapeHtml(assignees)} · updated ${escapeHtml(formatDate(issue.updatedAt))}</p>
      </div>
      <div class="repo-tags">${labels || '<span class="tag">no labels</span>'}</div>
      <p class="issue-body">${escapeHtml(body || 'No issue body available.')}</p>
      <div class="suggested-repos">${suggestedTags}</div>
    </div>
  `;
  if (els.issueInsights) {
    els.issueInsights.placeholder = 'Add reproduction notes, screenshots summary, edge cases, suspected files, QA hints, or anything the agent should not miss.';
  }
  els.workerBrief.textContent = workerBriefText(issue);
}

function selectedRepoObjects() {
  return state.repos.filter(repo => state.selectedRepos.has(repo.name));
}

function checksForBrief(repos) {
  const lines = [];
  for (const repo of repos) {
    if (repo.checks && repo.checks.length) {
      repo.checks.forEach(check => lines.push(`- ${repo.name}: ${check}`));
    } else {
      lines.push(`- ${repo.name}: define manual verification`);
    }
  }
  return lines.join('\n');
}

function workerBriefText(issue = selectedIssue()) {
  if (!issue) return 'Select an issue to generate a worker brief.';

  const slug = issueSlug(els.issueId.value || issue.number);
  const branch = currentBranchName();
  const issueRoot = state.health?.issueRoot || '<issue-root>';
  const workspacePath = `${issueRoot}/${slug}`;
  const repos = selectedRepoObjects();
  const repoLines = repos.length
    ? repos.map(repo => `- ${repoDisplayName(repo)}: ${workspacePath}/${repoDisplayName(repo)} (${branch}; local ${repo.name})`).join('\n')
    : '- No repos selected yet';
  const selectedChecks = repos.length ? checksForBrief(repos) : '- Select repos first';
  const body = stripMarkdown(issue.body).slice(0, 1200) || 'No issue body available.';
  const insights = currentIssueInsights();
  const root = state.health?.root || '<workspace-root>';

  return `# Worker Brief

Issue: #${issue.number} ${issue.title}
URL: ${issue.url}
Workspace: ${workspacePath}
Base ref: ${els.baseRef.value.trim() || 'origin/develop'}

Repos:
${repoLines}

Context:
${body}

Additional insights:
${insights || '- None added.'}

Goal:
- Reproduce or understand the reported behavior.
- Implement the smallest correct fix in the selected repos.
- Keep changes scoped to this issue.

Project rules:
- Preserve marketplaceId tenant isolation.
- Do not trust tenant, user, or marketplace headers from untrusted input.
- Keep internal platform token usage server-side.
- Maintain service boundaries and existing local patterns.
- Work only inside this issue workspace. Do not touch the base ${root} repos.
- Do not leave unused imports, variables, or dead code.

Verification:
${selectedChecks}

Observer checklist:
- Bug or task behavior verified.
- Related edge case checked.
- No unrelated files changed.
- PR-ready summary prepared per repo.`;
}

function commandPreviewText() {
  const repos = selectedRepoObjects();
  if (!repos.length) return 'Select repos to preview commands.';

  const slug = issueSlug(els.issueId.value);
  const branch = currentBranchName();
  const baseRef = els.baseRef.value.trim() || 'origin/develop';
  const issueRoot = state.health?.issueRoot || '<issue-root>';
  const issuePath = `${issueRoot}/${slug}`;
  const lines = [`mkdir -p ${shellQuote(issuePath)}`];

  for (const repo of repos) {
    const worktreeName = repoDisplayName(repo);
    if (els.fetchLatest.checked) lines.push(`git -C ${shellQuote(repo.name)} fetch --prune origin`);
    lines.push(`git -C ${shellQuote(repo.name)} worktree add ${shellQuote(`${issuePath}/${worktreeName}`)} -b ${shellQuote(branch)} ${shellQuote(baseRef)}`);
  }

  return lines.join('\n');
}

function renderCommandPreview() {
  els.commandPreview.textContent = commandPreviewText();
}

// ── PR review prompt ──────────────────────────────────────────────────────────

function splitReviewRefs(value) {
  return String(value || '')
    .split(/\n|,/)
    .map(item => item.trim())
    .filter(Boolean);
}

function selectedReviewChecks() {
  return [...els.reviewChecks]
    .filter(input => input.checked)
    .map(input => input.dataset.reviewCheck)
    .filter(Boolean);
}

function pullRequestForKey(key) {
  return state.pullRequests.find(pr => pullRequestKey(pr) === key) || null;
}

function pullRequestForRef(ref) {
  const value = String(ref || '').trim();
  if (!value) return null;

  return state.pullRequests.find(pr => {
    const compact = `${pr.repo}#${pr.number}`;
    const localCompact = `${pr.localRepo}#${pr.number}`;
    const displayCompact = `${pr.displayName}#${pr.number}`;
    return value === pr.url || value === compact || value === localCompact || value === displayCompact || (value.endsWith(`/pull/${pr.number}`) && value.includes(pr.repo));
  }) || null;
}

function pullRequestMetadataLine(pr) {
  if (!pr) return '';
  const review = formatReviewDecision(pr.reviewDecision);
  const draft = pr.isDraft ? ', draft' : '';
  const branch = [pr.headOwner, pr.headRefName].filter(Boolean).join(':') || pr.headRefName || 'unknown';
  return `- ${pr.displayName || pr.repo}#${pr.number}: ${pr.title} (${pr.author || 'unknown'}, ${review}${draft}, ${branch} -> ${pr.baseRefName || 'base'})`;
}

function prReviewPromptText() {
  const primaryPr = els.reviewPrimaryPr?.value.trim() || '';
  const relatedPrs = splitReviewRefs(els.reviewRelatedPrs?.value);
  const context = els.reviewContext?.value.trim() || '';
  const checks = selectedReviewChecks();
  const issue = selectedIssue();
  const selectedRepos = selectedRepoObjects().map(repo => repoDisplayName(repo));
  const root = state.health?.root || '<workspace-root>';
  const primaryMeta = pullRequestForRef(primaryPr);
  const relatedMetadata = relatedPrs.map(pullRequestForRef).filter(Boolean);

  return `# PR Review Brief

Primary PR:
${primaryPr || '- Add the primary PR URL or repo#number'}

Primary PR metadata:
${primaryMeta ? pullRequestMetadataLine(primaryMeta) : '- Select a fetched PR to include metadata'}

Related PRs:
${relatedPrs.length ? relatedPrs.map((pr, index) => `- ${index + 1}. ${pr}`).join('\n') : '- None listed'}

Related PR metadata:
${relatedMetadata.length ? relatedMetadata.map(pullRequestMetadataLine).join('\n') : '- None matched from fetched PRs'}

Issue context:
${issue ? `- #${issue.number} ${issue.title}\n- ${issue.url}` : '- No issue selected'}

Repos in local context:
${selectedRepos.length ? selectedRepos.map(repo => `- ${repo}`).join('\n') : '- Not selected in the workspace builder'}

Reviewer context:
${context || '- No extra reviewer context provided.'}

Review focus:
${checks.length ? checks.map(check => `- ${check}`).join('\n') : '- General correctness review'}

DokanCloud standards:
- Review all listed PRs as one change set, not as isolated diffs.
- Check whether related PRs need a specific merge or deploy order.
- Preserve marketplaceId tenant isolation and do not trust tenant, user, marketplace, or internal-token headers from untrusted input.
- Keep internal platform token usage server-side and respect service boundaries.
- Check flycom-dashboard/flycom-storefront flows for loading, empty, error, permission, and mobile states.
- Check data contracts, migrations, queue/event/webhook behavior, backward compatibility, and rollback risk.
- Verify tests or call out missing test coverage and manual QA steps.

Output format:
- Findings first, ordered by severity, with repo/file/line references when available.
- Related PR dependency notes.
- Missing or risky coding flows.
- Verification gaps.
- Final recommendation: approve, comment, or request changes.

Local workspace root:
${root}`;
}

function renderPrReviewPrompt() {
  if (!els.prReviewPrompt) return;
  els.prReviewPrompt.textContent = prReviewPromptText();
}

// ── Workspace card ────────────────────────────────────────────────────────────

function renderWorkspaceRepos(workspace) {
  if (!workspace.repos || !workspace.repos.length) {
    return '<div class="empty-state">No repos registered.</div>';
  }

  return workspace.repos.map(repo => {
    const dirty = repo.dirtyCount > 0 ? `${repo.dirtyCount} dirty` : repo.exists === false ? 'missing' : 'clean';
    const dirtyClass = repo.dirtyCount > 0 || repo.exists === false ? 'is-dirty' : 'is-clean';
    return `
      <div class="workspace-repo">
        <code>${escapeHtml(repo.displayName || repoDisplayName(repo.name))}</code>
        <code>${escapeHtml(repo.branch)}</code>
        <span class="tag ${dirtyClass}">${escapeHtml(dirty)}</span>
      </div>
    `;
  }).join('');
}

function renderWorkspaceOpenActions(workspace) {
  if (workspace.status === 'cleaned' || workspace.status === 'untracked') return '';
  const slug = escapeHtml(workspace.slug);
  return `
    <div class="workspace-open-actions">
      <button class="open-button" type="button" data-open-slug="${slug}" data-open-target="finder">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
        Finder
      </button>
      <button class="open-button" type="button" data-open-slug="${slug}" data-open-target="terminal">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 17 6-6-6-6" /><path d="M12 19h8" /></svg>
        Terminal
      </button>
      <button class="open-button" type="button" data-open-slug="${slug}" data-open-target="vscode">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3l-8 9 8 9" /><path d="M8 12H2" /></svg>
        VS Code
      </button>
      <button class="open-button" type="button" data-open-slug="${slug}" data-open-target="claude-code">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z" /></svg>
        Claude Code
      </button>
      <button class="open-button" type="button" data-open-slug="${slug}" data-open-target="claude-app">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z" /></svg>
        Claude Desktop
      </button>
    </div>
  `;
}

function renderWorkspaces() {
  const activeCount = state.workspaces.filter(ws => ws.status !== 'cleaned').length;
  els.workspaceCount.textContent = `${activeCount} active`;

  if (!state.workspaces.length) {
    els.workspaceList.innerHTML = '<div class="empty-state">No issue workspaces yet.</div>';
    return;
  }

  els.workspaceList.innerHTML = state.workspaces.map(workspace => {
    const canCleanup = workspace.status !== 'cleaned' && workspace.status !== 'untracked';
    const canPurge = workspace.status === 'cleaned' || workspace.status === 'untracked';
    const title = workspace.title ? `${workspace.slug} · ${workspace.title}` : workspace.slug;

    return `
      <article class="workspace-row">
        <div class="workspace-header">
          <div>
            <p class="workspace-title">${escapeHtml(title)}</p>
            <p class="workspace-path">${escapeHtml(workspace.issuePath)}</p>
          </div>
          <div class="workspace-actions">
            <span class="status-pill ${statusClass(workspace.status)}">${escapeHtml(workspace.status)}</span>
            <button class="secondary-button" type="button" data-cleanup="${escapeHtml(workspace.slug)}" ${canCleanup ? '' : 'disabled'}>Cleanup</button>
            <button class="secondary-button danger-button" type="button" data-purge="${escapeHtml(workspace.slug)}" ${canPurge ? '' : 'disabled'} title="Permanently delete workspace directory">Purge</button>
          </div>
        </div>
        <div class="workspace-meta">
          <span class="tag">base ${escapeHtml(workspace.baseRef || 'unknown')}</span>
          <span class="tag">${escapeHtml(workspace.agents?.worker || 'worker')}</span>
          <span class="tag">${escapeHtml(workspace.repos?.length || 0)} repos</span>
        </div>
        <div class="workspace-repos">${renderWorkspaceRepos(workspace)}</div>
        ${renderWorkspaceOpenActions(workspace)}
      </article>
    `;
  }).join('');
}

function renderAll() {
  renderIssues();
  renderIssueDetail();
  renderRepos();
  renderCommandPreview();
  renderPullRequests();
  renderPrReviewPrompt();
  renderWorkspaces();
}

// ── Busy / creation log ───────────────────────────────────────────────────────

function setBusy(isBusy) {
  state.busy = isBusy;
  els.createButton.disabled = isBusy;
  els.refreshButton.disabled = isBusy;
  els.createButton.classList.toggle('is-loading', isBusy);
  els.createButton.innerHTML = isBusy
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v4" /><path d="M12 18v4" /><path d="m4.93 4.93 2.83 2.83" /><path d="m16.24 16.24 2.83 2.83" /><path d="M2 12h4" /><path d="M18 12h4" /><path d="m4.93 19.07 2.83-2.83" /><path d="m16.24 7.76 2.83-2.83" /></svg> Working'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Create Workspace';
}

function showCreationLog(logs) {
  if (!logs || !logs.length) return;
  els.creationLog.hidden = false;
  els.creationLog.innerHTML = logs.map(entry => `
    <div class="creation-log-entry">
      <span class="log-time">${escapeHtml(new Date(entry.at).toLocaleTimeString())}</span>
      <span class="log-repo">${escapeHtml(entry.repo)}</span>
      <span class="log-output">${escapeHtml(entry.output || entry.command)}</span>
    </div>
  `).join('');
  els.creationLog.scrollTop = els.creationLog.scrollHeight;
}

function hideCreationLog() {
  els.creationLog.hidden = true;
  els.creationLog.innerHTML = '';
}

// ── API actions ───────────────────────────────────────────────────────────────

async function refresh() {
  setBusy(true);
  try {
    const [health, repos, workspaces] = await Promise.all([api('/api/health'), api('/api/repos'), api('/api/workspaces')]);
    state.health = health;
    state.repos = repos.repos;
    state.workspaces = workspaces.workspaces;
    els.serverStatus.textContent = 'Connected';
    els.serverStatus.className = 'status-pill';
    renderAll();
    await refreshIssues(false);
    if (state.pullRequestsLoaded || viewFromHash(window.location.hash) === 'pull-requests') {
      await refreshPullRequests(false);
    }
  } catch (error) {
    els.serverStatus.textContent = 'Offline';
    els.serverStatus.className = 'status-pill is-error';
    toast(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function refreshIssues(showToast = true) {
  els.refreshIssuesButton.disabled = true;
  try {
    const payload = await api('/api/issues');
    state.issues = payload.issues || [];
    state.issuesRepo = payload.repo || '';
    state.issuesSource = payload.source || '';
    state.viewer = payload.viewer || null;
    renderIssues();
    if (showToast) toast(`Loaded ${state.issues.length} issues from ${state.issuesRepo}.`, 'success');
  } catch (error) {
    state.issues = [];
    state.issuesSource = '';
    state.issuesRepo = '';
    els.issueCount.textContent = 'Error';
    els.issueCount.className = 'status-pill is-error';
    els.issueList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    if (showToast) toast(error.message, 'error');
  } finally {
    els.refreshIssuesButton.disabled = false;
  }
}

function ensurePullRequestsLoaded() {
  if (state.pullRequestsLoaded || state.pullRequestsLoading) return;
  refreshPullRequests(false);
}

async function refreshPullRequests(showToast = true) {
  if (!els.refreshPullRequestsButton) return;
  if (state.pullRequestsLoading) return;

  state.pullRequestsLoading = true;
  els.refreshPullRequestsButton.disabled = true;
  renderPullRequests();

  try {
    const payload = await api('/api/pull-requests');
    state.pullRequests = payload.pullRequests || [];
    state.pullRequestErrors = payload.errors || [];
    state.pullRequestSource = payload.source || '';
    state.viewer = payload.viewer || state.viewer;
    state.pullRequestsLoaded = true;
    renderPullRequests();

    if (showToast) {
      const suffix = state.pullRequestErrors.length ? ` (${state.pullRequestErrors.length} repo errors)` : '';
      toast(`Loaded ${state.pullRequests.length} open PRs${suffix}.`, state.pullRequestErrors.length ? 'info' : 'success');
    }
  } catch (error) {
    state.pullRequests = [];
    state.pullRequestErrors = [{ repo: 'GitHub', error: error.message }];
    state.pullRequestSource = '';
    state.pullRequestsLoaded = true;
    renderPullRequests();
    if (showToast) toast(error.message, 'error');
  } finally {
    state.pullRequestsLoading = false;
    els.refreshPullRequestsButton.disabled = false;
    renderPullRequests();
  }
}

async function createWorkspace(event) {
  event.preventDefault();

  const repos = [...state.selectedRepos];
  if (!repos.length) {
    toast('Select at least one repo.', 'error');
    return;
  }

  setBusy(true);
  hideCreationLog();

  let pollTimer = null;

  try {
    const issue = selectedIssue();
    const rawIssueId = els.issueId.value.trim();
    const slug = issueSlug(rawIssueId || String(issue?.number || ''));

    const payload = {
      issueId: rawIssueId,
      title: els.issueTitle.value.trim(),
      branchName: currentBranchName(),
      baseRef: els.baseRef.value.trim(),
      fetchLatest: els.fetchLatest.checked,
      repos,
      githubIssue: issue
        ? { repo: issue.repo, number: issue.number, title: issue.title, url: issue.url, labels: issue.labels || [], assignees: issue.assignees || [] }
        : null,
      workerBrief: workerBriefText(issue),
      agents: {
        orchestrator: els.agentOrchestrator.value,
        worker: els.agentWorker.value,
        observer: els.agentObserver.value,
        standards: els.agentStandards.value
      }
    };

    // Poll for live progress while the POST is in flight
    pollTimer = setInterval(async () => {
      try {
        const data = await api('/api/workspaces');
        const ws = data.workspaces.find(w => w.slug === slug);
        if (ws?.logs?.length) showCreationLog(ws.logs);
      } catch { /* silent */ }
    }, 1500);

    const result = await api('/api/workspaces', { method: 'POST', body: JSON.stringify(payload) });

    clearInterval(pollTimer);
    if (result.workspace?.logs?.length) showCreationLog(result.workspace.logs);

    state.selectedRepos.clear();
    toast(`Created ${result.workspace.slug}`, 'success');
    await refresh();
    setTimeout(hideCreationLog, 3000);
  } catch (error) {
    clearInterval(pollTimer);
    const suffix = error.payload?.workspace?.slug ? ` (${error.payload.workspace.slug})` : '';
    if (error.payload?.workspace?.logs?.length) showCreationLog(error.payload.workspace.logs);
    toast(`${error.message}${suffix}`, 'error');
    await refresh();
  } finally {
    setBusy(false);
  }
}

async function cleanupWorkspace(slug) {
  const confirmed = window.confirm(`Cleanup ${slug}? Worktrees with uncommitted changes will be refused by Git.`);
  if (!confirmed) return;

  setBusy(true);
  try {
    await api(`/api/workspaces/${encodeURIComponent(slug)}/cleanup`, {
      method: 'POST',
      body: JSON.stringify({ confirm: slug })
    });
    toast(`Cleaned ${slug}`, 'success');
    await refresh();
  } catch (error) {
    toast(error.message, 'error');
    await refresh();
  } finally {
    setBusy(false);
  }
}

async function purgeWorkspace(slug) {
  const confirmed = window.confirm(`Permanently delete workspace directory for ${slug}? This cannot be undone.`);
  if (!confirmed) return;

  setBusy(true);
  try {
    await api(`/api/workspaces/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirm: slug })
    });
    toast(`Purged ${slug}`, 'success');
    await refresh();
  } catch (error) {
    toast(error.message, 'error');
    await refresh();
  } finally {
    setBusy(false);
  }
}

async function openWorkspace(slug, target) {
  try {
    await api(`/api/workspaces/${encodeURIComponent(slug)}/open`, {
      method: 'POST',
      body: JSON.stringify({ target })
    });
  } catch (error) {
    toast(error.message, 'error');
  }
}

function claudeCodeReviewCwd() {
  const root = state.health?.root || '';
  const primaryPr = pullRequestForRef(els.reviewPrimaryPr.value);

  if (root && primaryPr?.localRepo) {
    return `${root}/${primaryPr.localRepo}`;
  }

  return root;
}

async function openClaudeCodeReview() {
  const prompt = prReviewPromptText();
  const cwd = claudeCodeReviewCwd();

  els.openClaudeCodeReviewButton.disabled = true;
  try {
    const result = await api('/api/agents/claude-code', {
      method: 'POST',
      body: JSON.stringify({ prompt, cwd })
    });

    const repo = pullRequestForRef(els.reviewPrimaryPr.value);
    const repoName = repo?.displayName || repo?.localRepo || 'DokanCloud';
    const copyNote = result.copied ? 'Review brief copied.' : `Clipboard copy failed${result.copyError ? `: ${result.copyError}` : '.'}`;
    toast(`Opened Claude Code in ${repoName}. ${copyNote}`, result.copied ? 'success' : 'error');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    els.openClaudeCodeReviewButton.disabled = false;
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

els.repoList.addEventListener('change', event => {
  const checkbox = event.target.closest('input[type="checkbox"][data-repo]');
  if (!checkbox) return;
  if (checkbox.checked) state.selectedRepos.add(checkbox.dataset.repo);
  else state.selectedRepos.delete(checkbox.dataset.repo);
  renderAll();
});

els.workspaceList.addEventListener('click', event => {
  const cleanupBtn = event.target.closest('[data-cleanup]');
  if (cleanupBtn && !cleanupBtn.disabled) { cleanupWorkspace(cleanupBtn.dataset.cleanup); return; }

  const purgeBtn = event.target.closest('[data-purge]');
  if (purgeBtn && !purgeBtn.disabled) { purgeWorkspace(purgeBtn.dataset.purge); return; }

  const openBtn = event.target.closest('[data-open-slug]');
  if (openBtn) openWorkspace(openBtn.dataset.openSlug, openBtn.dataset.openTarget);
});

els.issueList.addEventListener('click', event => {
  const button = event.target.closest('[data-issue-number]');
  if (!button) return;

  saveIssueInsights();

  const issueNumber = Number(button.dataset.issueNumber);
  const issue = state.issues.find(item => item.number === issueNumber);
  if (!issue) return;

  state.selectedIssueNumber = issue.number;
  els.issueId.value = String(issue.number);
  els.issueTitle.value = issue.title;
  loadIssueInsights(issue);
  state.branchNameTouched = false;
  syncBranchName(true);
  applySuggestedRepos(issue);
  renderAll();
});

els.pullRequestList.addEventListener('click', event => {
  const primaryButton = event.target.closest('[data-pr-primary]');
  if (primaryButton) {
    const pr = pullRequestForKey(primaryButton.dataset.prPrimary);
    if (!pr) return;
    state.selectedPullRequestKey = pullRequestKey(pr);
    els.reviewPrimaryPr.value = pullRequestRef(pr);
    renderPullRequests();
    renderPrReviewPrompt();
    return;
  }

  const relatedButton = event.target.closest('[data-pr-related]');
  if (relatedButton) {
    const pr = pullRequestForKey(relatedButton.dataset.prRelated);
    if (!pr) return;

    const ref = pullRequestRef(pr);
    const refs = splitReviewRefs(els.reviewRelatedPrs.value);
    const isAlreadyRelated = refs.includes(ref);

    if (isAlreadyRelated && event.detail >= 2) {
      els.reviewRelatedPrs.value = refs.filter(item => item !== ref).join('\n');
      renderPullRequests();
      renderPrReviewPrompt();
      toast('Removed related PR.', 'success');
      return;
    }

    if (!isAlreadyRelated) {
      refs.push(ref);
      els.reviewRelatedPrs.value = refs.join('\n');
    }

    renderPullRequests();
    renderPrReviewPrompt();
  }
});

els.pullRequestList.addEventListener('dblclick', event => {
  const relatedButton = event.target.closest('[data-pr-related]');
  if (!relatedButton) return;

  event.preventDefault();
  const pr = pullRequestForKey(relatedButton.dataset.prRelated);
  if (!pr) return;

  const ref = pullRequestRef(pr);
  const currentRefs = splitReviewRefs(els.reviewRelatedPrs.value);
  if (!currentRefs.includes(ref)) return;

  const refs = currentRefs.filter(item => item !== ref);
  els.reviewRelatedPrs.value = refs.join('\n');
  renderPullRequests();
  renderPrReviewPrompt();
  toast('Removed related PR.', 'success');
});

els.workspaceForm.addEventListener('submit', createWorkspace);
els.refreshButton.addEventListener('click', refresh);
els.refreshIssuesButton.addEventListener('click', () => refreshIssues(true));
els.refreshPullRequestsButton.addEventListener('click', () => refreshPullRequests(true));
els.themeToggle.addEventListener('click', toggleTheme);

const VIEW_HASHES = { 'pull-requests': '#pull-requests-view', 'sentry': '#sentry-view', 'my-list': '#my-list-view' };

els.viewTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const view = tab.dataset.viewTab;
    setActiveView(view);
    history.replaceState(null, '', VIEW_HASHES[view] || '#issues-view');
  });
});

els.viewLinks.forEach(link => {
  link.addEventListener('click', event => {
    const view = link.dataset.viewLink;
    setActiveView(view);
    if (VIEW_HASHES[view]) {
      event.preventDefault();
      history.replaceState(null, '', VIEW_HASHES[view]);
      document.getElementById(view + '-view')?.scrollIntoView({ block: 'start' });
    }
  });
});

els.applySuggestionsButton.addEventListener('click', () => {
  const issue = selectedIssue();
  if (!issue) { toast('Select an issue first.', 'error'); return; }
  applySuggestedRepos(issue);
  renderAll();
  toast('Suggested repos applied.', 'success');
});

els.clearSuggestedButton.addEventListener('click', () => {
  state.suggestedRepos.forEach(repo => state.selectedRepos.delete(repo));
  state.suggestedRepos.clear();
  renderAll();
});

els.repoSearch.addEventListener('input', event => { state.filter = event.target.value; renderRepos(); });
els.issueSearch.addEventListener('input', event => { state.issueFilter = event.target.value; renderIssues(); });
els.assigneeFilter.addEventListener('change', event => { state.assigneeFilter = event.target.value; renderIssues(); });
els.issueInsights.addEventListener('input', () => {
  saveIssueInsights();
  els.workerBrief.textContent = workerBriefText();
});
els.prSearch.addEventListener('input', event => { state.prFilter = event.target.value; renderPullRequests(); });
els.prRepoFilter.addEventListener('change', event => { state.prRepoFilter = event.target.value; renderPullRequests(); });
els.prAuthorFilter.addEventListener('change', event => { state.prAuthorFilter = event.target.value; renderPullRequests(); });
els.prReviewFilter.addEventListener('change', event => { state.prReviewFilter = event.target.value; renderPullRequests(); });

els.selectAllButton.addEventListener('click', () => {
  state.repos.filter(repoMatches).forEach(repo => state.selectedRepos.add(repo.name));
  renderAll();
});

els.selectDirtyButton.addEventListener('click', () => {
  state.repos.filter(repoMatches).filter(repo => repo.dirtyCount > 0).forEach(repo => state.selectedRepos.add(repo.name));
  renderAll();
});

els.clearSelectionButton.addEventListener('click', () => { state.selectedRepos.clear(); renderAll(); });

els.copyCommandsButton.addEventListener('click', copyWithFeedback(els.copyCommandsButton, commandPreviewText));
els.copyBriefButton.addEventListener('click', copyWithFeedback(els.copyBriefButton, workerBriefText));
els.copyPrReviewPromptButton.addEventListener('click', copyWithFeedback(els.copyPrReviewPromptButton, prReviewPromptText));
els.openClaudeCodeReviewButton.addEventListener('click', openClaudeCodeReview);

[els.reviewPrimaryPr, els.reviewRelatedPrs, els.reviewContext].forEach(input => {
  input.addEventListener('input', renderPrReviewPrompt);
});

els.reviewPrimaryPr.addEventListener('input', () => {
  const pr = pullRequestForRef(els.reviewPrimaryPr.value);
  state.selectedPullRequestKey = pr ? pullRequestKey(pr) : null;
  renderPullRequests();
});

els.reviewRelatedPrs.addEventListener('input', renderPullRequests);

els.reviewChecks.forEach(input => {
  input.addEventListener('change', renderPrReviewPrompt);
});

[els.issueId, els.issueTitle].forEach(input => {
  input.addEventListener('input', () => { saveIssueInsights(); syncBranchName(); renderAll(); });
  input.addEventListener('change', () => { saveIssueInsights(); syncBranchName(); renderAll(); });
});

els.branchName.addEventListener('input', () => { state.branchNameTouched = true; renderAll(); });

[els.baseRef, els.fetchLatest].forEach(input => {
  input.addEventListener('input', renderCommandPreview);
  input.addEventListener('change', renderCommandPreview);
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener('keydown', event => {
  if (event.target.matches('input, select, textarea, [contenteditable]')) return;

  if (event.key === 'r' || event.key === 'R') { if (!state.busy) refresh(); return; }
  if (event.key === 't' || event.key === 'T') { toggleTheme(); return; }
  if (event.key === '/') { event.preventDefault(); els.issueSearch.focus(); return; }
  if (event.key === 'Escape') { state.selectedRepos.clear(); state.suggestedRepos.clear(); renderAll(); return; }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    if (!state.busy && state.selectedRepos.size > 0) els.workspaceForm.requestSubmit();
  }
});

window.addEventListener('hashchange', () => {
  setActiveView(viewFromHash(window.location.hash));
});

// ── Auto-refresh workspaces every 30s ─────────────────────────────────────────

setInterval(() => {
  if (state.busy || document.visibilityState !== 'visible') return;
  api('/api/workspaces').then(data => {
    state.workspaces = data.workspaces;
    renderWorkspaces();
  }).catch(() => {});
}, 30000);

// ── My List (localStorage) ────────────────────────────────────────────────────

const MY_LIST_KEY = 'orchestrator:my-list';

function loadMyList() {
  try {
    return JSON.parse(localStorage.getItem(MY_LIST_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveMyList(items) {
  localStorage.setItem(MY_LIST_KEY, JSON.stringify(items));
}

function myListFilter(item) {
  const q = (els.myListSearch?.value || '').trim().toLowerCase();
  if (!q) return true;
  return [item.title, item.body, ...(item.labels || [])].join(' ').toLowerCase().includes(q);
}

function renderMyList() {
  const items = loadMyList();
  const filtered = items.filter(myListFilter);

  els.myListCount.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;

  if (!filtered.length) {
    els.myListItems.innerHTML = items.length
      ? '<div class="empty-state">No items match the filter.</div>'
      : '<div class="empty-state">No items yet. Add one above.</div>';
    return;
  }

  els.myListItems.innerHTML = filtered.map(item => {
    const labels = (item.labels || []).map(l => `<span class="tag">${escapeHtml(l)}</span>`).join('');
    const pushed = item.githubIssueNumber
      ? `<a class="tag is-blue" href="${escapeHtml(item.githubIssueUrl)}" target="_blank" rel="noopener">#${item.githubIssueNumber}</a>`
      : '';
    const date = formatDate(item.createdAt);

    return `
      <article class="my-list-item" data-item-id="${escapeHtml(item.id)}">
        <div class="my-list-item-header">
          <div class="my-list-item-meta">
            <p class="my-list-item-title">${escapeHtml(item.title)}</p>
            <p class="issue-subtitle">Added ${escapeHtml(date)}</p>
          </div>
          <div class="repo-tags">
            ${pushed}
            ${labels}
          </div>
        </div>
        ${item.body ? `<div class="my-list-item-body md-body">
          <div class="md-body-inner">${renderMarkdown(item.body)}</div>
          ${item.body.length > 400 ? `<button class="md-expand-btn" type="button" data-action="expand-body">Show more</button>` : ''}
        </div>` : ''}
        <div class="my-list-item-actions">
          <button class="secondary-button" type="button" data-action="use-item" title="Pre-fill the workspace builder with this item">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Create Workspace
          </button>
          <button class="secondary-button" type="button" data-action="push-item" ${item.githubIssueNumber ? 'disabled title="Already pushed to GitHub"' : 'title="Create a GitHub issue from this item"'}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77a5.07 5.07 0 0 0-.09-3.77S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" /></svg>
            ${item.githubIssueNumber ? `Pushed #${item.githubIssueNumber}` : 'Push to GitHub'}
          </button>
          <button class="secondary-button danger-button" type="button" data-action="delete-item" title="Delete from list">
            <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
            Delete
          </button>
        </div>
      </article>
    `;
  }).join('');
}

function addMyListItem(title, body, labels) {
  const items = loadMyList();
  items.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    body,
    labels,
    createdAt: new Date().toISOString(),
    githubIssueNumber: null,
    githubIssueUrl: null
  });
  saveMyList(items);
  renderMyList();
}

function deleteMyListItem(id) {
  const items = loadMyList().filter(item => item.id !== id);
  saveMyList(items);
  renderMyList();
}

async function pushMyListItemToGitHub(id) {
  const items = loadMyList();
  const item = items.find(i => i.id === id);
  if (!item) return;

  try {
    const result = await api('/api/github/issues', {
      method: 'POST',
      body: JSON.stringify({
        repo: state.health?.githubIssuesRepo || '',
        title: item.title,
        body: item.body,
        labels: item.labels
      })
    });

    item.githubIssueNumber = result.issue.number;
    item.githubIssueUrl = result.issue.url;
    saveMyList(items);
    renderMyList();
    toast(`Created GitHub issue #${result.issue.number}`, 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function useMyListItem(id) {
  const item = loadMyList().find(i => i.id === id);
  if (!item) return;

  // Pre-fill the builder form
  els.issueId.value = item.githubIssueNumber ? String(item.githubIssueNumber) : '';
  els.issueTitle.value = item.title;
  state.branchNameTouched = false;
  syncBranchName(true);

  // Suggest repos based on title + body
  const fakeIssue = { title: item.title, body: item.body, labels: item.labels, assignees: [], number: item.githubIssueNumber || 0, url: item.githubIssueUrl || '' };
  applySuggestedRepos(fakeIssue);

  // Switch to issues view and scroll to builder
  setActiveView('issues');
  history.replaceState(null, '', '#issues-view');
  document.getElementById('builder')?.scrollIntoView({ behavior: 'smooth' });
  renderAll();
  toast(`Builder pre-filled from "${item.title}"`, 'success');
}

// My List event listeners

els.myListForm?.addEventListener('submit', event => {
  event.preventDefault();
  const title = els.myListTitle.value.trim();
  if (!title) return;
  const body = els.myListBody.value.trim();
  const labels = els.myListLabels.value.split(',').map(l => l.trim()).filter(Boolean);
  addMyListItem(title, body, labels);
  els.myListForm.reset();
  toast('Added to list.', 'success');
});

els.myListItems?.addEventListener('click', event => {
  const article = event.target.closest('[data-item-id]');
  if (!article) return;
  const id = article.dataset.itemId;

  const btn = event.target.closest('[data-action]');
  if (!btn || btn.disabled) return;

  if (btn.dataset.action === 'use-item') useMyListItem(id);
  if (btn.dataset.action === 'push-item') pushMyListItemToGitHub(id);
  if (btn.dataset.action === 'delete-item') {
    if (window.confirm('Delete this item?')) deleteMyListItem(id);
  }
  if (btn.dataset.action === 'expand-body') {
    const body = article.querySelector('.my-list-item-body');
    if (!body) return;
    const expanded = body.classList.toggle('is-expanded');
    btn.textContent = expanded ? 'Show less' : 'Show more';
  }
});

els.myListSearch?.addEventListener('input', renderMyList);

// Initial render
renderMyList();

// ── Sentry project → local repo mapping ──────────────────────────────────────

const SENTRY_PROJECT_REPO_MAP = {
  'dokan-app':                  ['flycom-app'],
  'dokan-cloud':                ['dokan-cloud'],
  'dokan-cloud-backend':        ['dokan-cloud', 'flycom-auth-service', 'flycom-payment-service', 'flycom-integration-service'],
  'dokan-cloud-dashboard':      ['dashboard'],
  'dokan-cloud-dashboard-fh':   ['dashboard'],
  'dokan-cloud-dashboard-rd':   ['dashboard'],
  'dokan-cloud-storefront':     ['storefront']
};

// ── Sentry browser ───────────────────────────────────────────────────────────

function sentryLevelClass(level) {
  if (level === 'error' || level === 'fatal') return 'is-dirty';
  if (level === 'warning') return 'is-warn';
  if (level === 'info') return 'is-blue';
  return 'is-muted';
}

function formatSentryCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function sentryIssueMatches(issue) {
  const q = state.sentryFilter.trim().toLowerCase();
  if (q && ![issue.title, issue.culprit, issue.project, issue.level].join(' ').toLowerCase().includes(q)) return false;
  if (state.sentryProjectFilter !== 'all' && issue.project !== state.sentryProjectFilter) return false;
  if (state.sentryLevelFilter !== 'all' && issue.level !== state.sentryLevelFilter) return false;
  return true;
}

function selectedSentryIssue() {
  return state.sentryIssues.find(i => i.id === state.selectedSentryId) || null;
}

function renderSentryProjectFilter() {
  if (!els.sentryProjectFilter) return;
  const projects = [...new Set(state.sentryIssues.map(i => i.project).filter(Boolean))].sort();
  const current = state.sentryProjectFilter;
  els.sentryProjectFilter.innerHTML = [
    '<option value="all">All projects</option>',
    ...projects.map(p => `<option value="${escapeHtml(p)}" ${p === current ? 'selected' : ''}>${escapeHtml(p)}</option>`)
  ].join('');
}

// ── Sentry detail helpers ─────────────────────────────────────────────────────

function renderSentryFrameContext(frame) {
  if (!frame.context || !frame.context.length) return '';

  const lines = frame.context.map(([lineNo, code]) => {
    const isCurrent = lineNo === frame.lineno;
    const lineStr = String(lineNo).padStart(4);
    return `<span class="sentry-code-line${isCurrent ? ' is-current' : ''}">${escapeHtml(lineStr)}  ${escapeHtml(code)}</span>`;
  }).join('\n');

  return `<pre class="sentry-frame-context">${lines}</pre>`;
}

function renderSentryFrameVars(vars) {
  const entries = Object.entries(vars);
  if (!entries.length) return '';
  const rows = entries.slice(0, 12).map(([k, v]) => {
    const val = typeof v === 'string' ? v : JSON.stringify(v);
    return `<tr><td class="sentry-var-key">${escapeHtml(k)}</td><td class="sentry-var-val">${escapeHtml(val.slice(0, 200))}</td></tr>`;
  }).join('');
  return `<table class="sentry-vars-table">${rows}</table>`;
}

function renderSentryStacktrace(frames) {
  if (!frames.length) return '<p class="sentry-no-frames">No frames available.</p>';

  const inAppCount = frames.filter(f => f.inApp).length;
  let frameworkGroup = [];
  const parts = [];
  let frameworkIndex = 0;

  const flushFramework = () => {
    if (!frameworkGroup.length) return;
    const idx = frameworkIndex++;
    const inner = frameworkGroup.map(f => {
      const location = f.filename ? `${f.filename}:${f.lineno}` : '';
      return `<div class="sentry-frame is-framework">
        <div class="sentry-frame-header">
          <span class="sentry-frame-func">${escapeHtml(f.fn || f.module || '(unknown)')}</span>
          ${location ? `<span class="sentry-frame-location">${escapeHtml(location)}</span>` : ''}
        </div>
      </div>`;
    }).join('');
    parts.push(`
      <div class="sentry-frame-group">
        <button class="sentry-frame-group-toggle" type="button" data-frame-group="${idx}">
          ${frameworkGroup.length} framework frame${frameworkGroup.length > 1 ? 's' : ''}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        <div class="sentry-frame-group-body" id="sentry-fg-${idx}" hidden>${inner}</div>
      </div>`);
    frameworkGroup = [];
  };

  frames.forEach((frame, i) => {
    if (!frame.inApp) {
      frameworkGroup.push(frame);
      return;
    }
    flushFramework();

    const isSuspect = i === 0 && inAppCount > 0;
    const shortFile = frame.filename.replace(/^.*?(\/modules\/|\/src\/|\/app\/|\/pages\/)/, '$1');
    const location = frame.filename ? `${shortFile}:${frame.lineno}` : '';

    parts.push(`
      <div class="sentry-frame is-in-app${isSuspect ? ' is-suspect' : ''}">
        <div class="sentry-frame-header">
          <div class="sentry-frame-fn-row">
            <span class="sentry-frame-func">${escapeHtml(frame.fn || frame.module || '(anonymous)')}</span>
            ${location ? `<span class="sentry-frame-location">${escapeHtml(location)}</span>` : ''}
          </div>
          <span class="tag${isSuspect ? ' is-dirty' : ''}">in app</span>
        </div>
        ${renderSentryFrameContext(frame)}
        ${renderSentryFrameVars(frame.vars)}
      </div>`);
  });

  flushFramework();
  return parts.join('');
}

function renderSentryTags(tags) {
  if (!tags.length) return '<p class="sentry-no-tags is-muted">No tags on this event.</p>';
  const rows = tags.map(t =>
    `<tr><td class="sentry-tag-key">${escapeHtml(t.key)}</td><td class="sentry-tag-val">${escapeHtml(t.value)}</td></tr>`
  ).join('');
  return `<table class="sentry-tags-table">${rows}</table>`;
}

function renderSentryDetail() {
  if (!els.sentryDetail) return;
  const issue = selectedSentryIssue();

  if (!issue) {
    els.sentryDetail.innerHTML = '<div class="empty-state">Select an issue from the list to see details.</div>';
    return;
  }

  const levelClass = sentryLevelClass(issue.level);
  const events = formatSentryCount(issue.count);
  const users = formatSentryCount(issue.userCount);
  const firstSeen = issue.firstSeen ? new Date(issue.firstSeen).toLocaleString() : '—';
  const lastSeen = issue.lastSeen ? new Date(issue.lastSeen).toLocaleString() : '—';

  const baseHtml = `
    <div class="sentry-detail-header">
      <div class="repo-tags">
        <span class="tag ${levelClass}">${escapeHtml(issue.level)}</span>
        ${issue.project ? `<span class="tag">${escapeHtml(issue.project)}</span>` : ''}
        ${issue.isUnhandled ? '<span class="tag is-dirty">unhandled</span>' : ''}
        ${issue.type ? `<span class="tag is-muted">${escapeHtml(issue.type)}</span>` : ''}
      </div>
      ${issue.permalink ? `<a class="secondary-button sentry-link" href="${escapeHtml(issue.permalink)}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
        Sentry ↗
      </a>` : ''}
    </div>

    <h3 class="sentry-detail-title">${escapeHtml(issue.title)}</h3>
    ${issue.culprit ? `<p class="sentry-detail-culprit">${escapeHtml(issue.culprit)}</p>` : ''}

    <div class="sentry-detail-meta">
      <span><strong>ID:</strong> ${escapeHtml(issue.id)}</span>
      <span><strong>Project:</strong> ${escapeHtml(issue.project)}</span>
      ${issue.lastSeen ? `<span><strong>Last seen:</strong> ${escapeHtml(new Date(issue.lastSeen).toLocaleString())}</span>` : ''}
    </div>

    <div class="sentry-detail-stats">
      <div class="sentry-stat">
        <span class="sentry-stat-value">${escapeHtml(events)}</span>
        <span class="sentry-stat-label">events</span>
      </div>
      <div class="sentry-stat">
        <span class="sentry-stat-value">${escapeHtml(users)}</span>
        <span class="sentry-stat-label">users</span>
      </div>
      <div class="sentry-stat">
        <span class="sentry-stat-value">${escapeHtml(lastSeen)}</span>
        <span class="sentry-stat-label">last seen</span>
      </div>
      <div class="sentry-stat">
        <span class="sentry-stat-value">${escapeHtml(firstSeen)}</span>
        <span class="sentry-stat-label">first seen</span>
      </div>
    </div>

    <div class="sentry-detail-actions">
      <button class="primary-button" type="button" data-sentry-detail-action="add">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        Add to My List
      </button>
      <button class="secondary-button" type="button" data-sentry-detail-action="workspace">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        Create Workspace
      </button>
    </div>`;

  const detail = state.sentryDetailCache[issue.id];

  if (!detail) {
    // Trigger async load, show spinner in the extended sections only
    loadSentryIssueDetail(issue.id);
    els.sentryDetail.innerHTML = `<div class="sentry-detail-card">
      ${baseHtml}
      <div class="sentry-detail-loading">Loading tags and stacktrace…</div>
    </div>`;
    return;
  }

  const tagsSection = `
    <section class="sentry-detail-section">
      <h4 class="sentry-section-title">Tags</h4>
      ${detail.error ? `<p class="sentry-fetch-error">${escapeHtml(detail.error)}</p>` : renderSentryTags(detail.tags || [])}
    </section>`;

  const exceptionsSection = (detail.exceptions || []).map((exc, i) => `
    <section class="sentry-detail-section">
      <h4 class="sentry-section-title">Exception${detail.exceptions.length > 1 ? ` ${i + 1}` : ''}</h4>
      <p class="sentry-exception-header"><strong>${escapeHtml(exc.type)}</strong>: ${escapeHtml(exc.value)}</p>
      <div class="sentry-stacktrace">${renderSentryStacktrace(exc.frames || [])}</div>
    </section>`).join('');

  const errBanner = (detail.errors || []).length
    ? detail.errors.map(e => `<p class="sentry-fetch-error">${escapeHtml(e)}</p>`).join('')
    : '';

  els.sentryDetail.innerHTML = `<div class="sentry-detail-card">
    ${baseHtml}
    ${errBanner}
    ${tagsSection}
    ${exceptionsSection || ''}
  </div>`;

  // Wire up framework-frame toggles (rendered inside innerHTML so need post-render binding)
  els.sentryDetail.querySelectorAll('.sentry-frame-group-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const body = document.getElementById(`sentry-fg-${btn.dataset.frameGroup}`);
      if (!body) return;
      const open = body.hidden;
      body.hidden = !open;
      btn.classList.toggle('is-open', open);
    });
  });
}

function renderSentryIssues() {
  if (!els.sentryList) return;

  if (state.sentryLoading) {
    els.sentryCount.textContent = 'Loading';
    els.sentryCount.className = 'status-pill is-warn';
    els.sentryList.innerHTML = '<div class="empty-state">Fetching issues from Sentry…</div>';
    renderSentryDetail();
    return;
  }

  if (state.sentryUnconfigured || (!state.sentryLoaded && state.sentryError)) {
    els.sentryCount.textContent = 'Not configured';
    els.sentryCount.className = 'status-pill is-muted';
    els.sentryList.innerHTML = `
      <div class="empty-state sentry-unconfigured-hint">
        <strong>Sentry not configured.</strong><br>
        ${escapeHtml(state.sentryError || 'Add the required variables to your .env file.')}<br><br>
        <code>SENTRY_AUTH_TOKEN=sntrys_…\nSENTRY_ORG=your-org-slug\nSENTRY_PROJECT=your-project</code>
      </div>
    `;
    renderSentryDetail();
    return;
  }

  if (!state.sentryLoaded) {
    els.sentryCount.textContent = 'Not loaded';
    els.sentryCount.className = 'status-pill is-muted';
    els.sentryList.innerHTML = '<div class="empty-state">Open the Sentry tab to auto-load issues.</div>';
    renderSentryDetail();
    return;
  }

  renderSentryProjectFilter();

  const filtered = state.sentryIssues.filter(sentryIssueMatches);
  const total = state.sentryIssues.length;
  els.sentryCount.textContent = filtered.length < total ? `${filtered.length} of ${total}` : `${total} issues`;
  els.sentryCount.className = total > 0 ? 'status-pill is-warn' : 'status-pill is-muted';

  const errBanner = state.sentryErrors.length
    ? state.sentryErrors.map(e => `<p class="sentry-fetch-error">${escapeHtml(e)}</p>`).join('')
    : '';

  if (!filtered.length) {
    els.sentryList.innerHTML = errBanner + (total
      ? '<div class="empty-state">No issues match the current filters.</div>'
      : '<div class="empty-state">No unresolved Sentry issues found. 🎉</div>');
    renderSentryDetail();
    return;
  }

  els.sentryList.innerHTML = errBanner + filtered.map(issue => {
    const levelClass = sentryLevelClass(issue.level);
    const selected = state.selectedSentryId === issue.id ? 'is-selected' : '';
    const culprit = issue.culprit
      ? `<p class="sentry-row-culprit" title="${escapeHtml(issue.culprit)}">${escapeHtml(issue.culprit)}</p>`
      : '';
    return `
      <button class="sentry-row ${selected}" type="button" data-sentry-id="${escapeHtml(issue.id)}">
        <span class="sentry-row-body">
          <span class="sentry-row-title">${escapeHtml(issue.title)}</span>
          ${culprit}
        </span>
        <span class="sentry-row-meta">
          <span class="tag ${levelClass}">${escapeHtml(issue.level)}</span>
          <span class="sentry-row-count">${escapeHtml(formatSentryCount(issue.count))}</span>
          <span class="sentry-row-date">${escapeHtml(formatDate(issue.lastSeen))}</span>
        </span>
      </button>
    `;
  }).join('');

  renderSentryDetail();
}

async function loadSentryIssues() {
  if (state.sentryLoading) return;
  state.sentryLoading = true;
  state.sentryError = null;
  state.sentryUnconfigured = false;
  renderSentryIssues();

  try {
    const data = await api('/api/sentry/issues');
    state.sentryIssues = data.issues || [];
    state.sentryErrors = data.errors || [];
    state.sentryLoaded = true;
    const suffix = state.sentryErrors.length ? ` (${state.sentryErrors.length} project error${state.sentryErrors.length > 1 ? 's' : ''})` : '';
    toast(`Loaded ${state.sentryIssues.length} Sentry issues${suffix}.`, state.sentryErrors.length ? 'info' : 'success');
  } catch (error) {
    state.sentryError = error.message;
    state.sentryUnconfigured = error.payload?.unconfigured || false;
    if (!state.sentryUnconfigured) toast(error.message, 'error');
  } finally {
    state.sentryLoading = false;
    renderSentryIssues();
  }
}

// ── Sentry brief generator ────────────────────────────────────────────────────

function _sentryAnalyseError(type, value) {
  // Returns { summary, rootCause, fix } plain-English strings based on error patterns.
  const t = (type || '').trim();
  const v = (value || '').trim();
  const vl = v.toLowerCase();
  const tl = t.toLowerCase();

  // ── TypeError patterns ────────────────────────────────────────────────────
  if (tl.includes('typeerror')) {
    // Return type mismatch: "must be of type array, int returned"
    const retMatch = v.match(/must be of type (\S+),\s*(\S+) returned/i);
    if (retMatch) {
      const expected = retMatch[1], got = retMatch[2];
      return {
        summary: `A \`${t}\` is thrown because the function declares it returns \`${expected}\` but is actually returning \`${got}\`.`,
        rootCause: `The return type annotation says \`${expected}\`, but at runtime a \`${got}\` value is returned instead. PHP 8 enforces return types strictly, so this crashes immediately.`,
        fix: `Audit every \`return\` statement in the flagged function. Either cast to the declared type (\`(${expected}) $value\`), add an early guard that converts non-\`${expected}\` values, or update the return type annotation if the broader behaviour is intentional.`
      };
    }

    // Argument type mismatch: "Argument #1 ($foo) must be of type …"
    const argMatch = v.match(/Argument #(\d+)\s*\((\$\S+)\)\s*must be of type (\S+),\s*(\S+) given/i);
    if (argMatch) {
      const [, argN, argName, expected, got] = argMatch;
      return {
        summary: `\`${t}\`: argument ${argN} (\`${argName}\`) must be \`${expected}\` but a \`${got}\` was passed.`,
        rootCause: `The caller is passing a \`${got}\` where the function signature requires \`${expected}\`. This usually happens when nullable values or API responses aren't validated before being forwarded.`,
        fix: `Add a null/type check before calling this function, or use the nullsafe operator (\`?->\`) if \`${argName}\` can be null. If the type should genuinely be broader, widen the parameter type.`
      };
    }

    // JS: Cannot read properties of undefined/null
    const propMatch = v.match(/Cannot read propert(?:y|ies) (?:of )?(undefined|null)(?: \(reading '([^']+)'\))?/i);
    if (propMatch) {
      const nullish = propMatch[1], prop = propMatch[2];
      return {
        summary: `\`${t}\`: attempted to access \`${prop ? `.${prop}` : 'a property'}\` on \`${nullish}\`.`,
        rootCause: `The object expected to exist is \`${nullish}\` at the point of access. This typically means an async data fetch hasn't resolved yet, a conditional render is missing, or the API returned an unexpected shape.`,
        fix: prop
          ? `Guard the access with optional chaining: \`obj?.${prop}\`, or ensure the data is loaded before the component renders.`
          : `Add a null guard before accessing the property, or use optional chaining (\`?.\`) throughout.`
      };
    }

    // JS: X is not a function
    const notFnMatch = v.match(/(.+) is not a function/i);
    if (notFnMatch) {
      return {
        summary: `\`${t}\`: \`${notFnMatch[1]}\` is being called as a function but it isn't one.`,
        rootCause: `At runtime \`${notFnMatch[1]}\` resolves to a non-function value (often \`undefined\`, an object, or a string). This commonly happens after a refactor renames or removes a method, or when an import resolves to the wrong export.`,
        fix: `Check that \`${notFnMatch[1]}\` is imported and exported correctly. Add a \`typeof\` guard or assert the value before calling it.`
      };
    }

    return {
      summary: `\`${t}\`: ${v}`,
      rootCause: `A value of the wrong type was encountered at runtime.`,
      fix: `Review the flagged function's inputs and return values and add type guards or validation before they are used.`
    };
  }

  // ── ReferenceError ────────────────────────────────────────────────────────
  if (tl.includes('referenceerror')) {
    const notDefined = v.match(/(\S+) is not defined/i);
    if (notDefined) {
      return {
        summary: `\`${t}\`: \`${notDefined[1]}\` is used but was never defined.`,
        rootCause: `The identifier \`${notDefined[1]}\` isn't in scope at the point of access. Possible causes: missing import, typo in the variable name, or code running before the variable is initialised.`,
        fix: `Verify the spelling and check that \`${notDefined[1]}\` is imported or declared in the correct scope. If it's conditionally defined, add a guard before using it.`
      };
    }
    return {
      summary: `\`${t}\`: ${v}`,
      rootCause: `A variable or identifier was accessed before it was defined.`,
      fix: `Check the declaration order and imports in the failing file.`
    };
  }

  // ── Error / Exception (generic) ───────────────────────────────────────────
  if (tl.includes('error') || tl.includes('exception')) {
    // Model not found
    if (vl.includes('no query results for model')) {
      const modelMatch = v.match(/No query results for model \[([^\]]+)\](?: (\S+))?/i);
      const model = modelMatch?.[1] || 'Model';
      const id = modelMatch?.[2] || '';
      return {
        summary: `A \`${t}\` is thrown because ${model}${id ? ` #${id}` : ''} could not be found in the database.`,
        rootCause: `\`findOrFail()\` (or equivalent) was called with an ID that doesn't exist. The record may have been deleted, or the wrong ID was passed from the caller.`,
        fix: `Use \`find()\` and handle the \`null\` case gracefully, or catch \`ModelNotFoundException\` and return a proper 404 response. Validate incoming IDs against the authenticated user's tenant before querying.`
      };
    }

    // PDO / DB errors
    if (vl.includes('pdoexception') || vl.includes('sqlstate')) {
      return {
        summary: `A database error crashed the request: "${v.slice(0, 120)}".`,
        rootCause: `The SQL query failed — likely due to a schema mismatch (missing column/table), a constraint violation, or a connection issue.`,
        fix: `Check whether pending migrations have been run. Review the query for invalid column references. If it's a constraint violation, add pre-flight validation before the write.`
      };
    }

    // Connection refused / timeout
    if (vl.includes('connection refused') || vl.includes('etimedout') || vl.includes('econnrefused')) {
      return {
        summary: `The service failed to connect to a downstream dependency: "${v.slice(0, 120)}".`,
        rootCause: `A TCP connection attempt was rejected or timed out. The target service (database, Redis, external API) may be down, misconfigured, or unreachable from this host.`,
        fix: `Verify the host/port configuration in the environment. Check that the dependency is running and reachable from this service's network. Add a circuit breaker or retry with backoff.`
      };
    }

    // Unserialize / JSON decode
    if (vl.includes('json') && (vl.includes('decode') || vl.includes('parse') || vl.includes('syntax'))) {
      return {
        summary: `JSON parsing failed: "${v.slice(0, 120)}".`,
        rootCause: `An API response or stored value is not valid JSON. This can happen if the upstream service returns an error HTML page, a binary blob, or a truncated payload.`,
        fix: `Log the raw response before parsing and validate it. Add error handling around the \`JSON.parse()\` call and fail gracefully with a meaningful message.`
      };
    }
  }

  // ── ValueError ────────────────────────────────────────────────────────────
  if (tl.includes('valueerror')) {
    return {
      summary: `\`${t}\`: an unexpected value was encountered — "${v.slice(0, 120)}".`,
      rootCause: `A function received a value it can't handle. This is usually a missing validation step or an assumption about the data format that doesn't always hold.`,
      fix: `Add input validation before calling the failing function and surface a clear error message to the user rather than crashing.`
    };
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  return {
    summary: `\`${t}\`: ${v.slice(0, 180)}`,
    rootCause: null,
    fix: null
  };
}

function generateSentryBrief(issue, detail) {
  // issue  — normalized Sentry issue object from state.sentryIssues
  // detail — cached detail from state.sentryDetailCache[issue.id] (may be null)

  const lines = [];

  // ── Title ─────────────────────────────────────────────────────────────────
  lines.push(`## ${issue.title}`);
  lines.push('');

  // ── Exception analysis ────────────────────────────────────────────────────
  const exc = detail?.exceptions?.[0];
  const analysis = exc ? _sentryAnalyseError(exc.type, exc.value) : null;

  if (analysis) {
    lines.push(analysis.summary);
    lines.push('');
  } else if (issue.culprit) {
    lines.push(`A \`${issue.level}\` occurred in \`${issue.culprit}\`.`);
    lines.push('');
  }

  // ── Key facts ─────────────────────────────────────────────────────────────
  const tags = detail?.tags || [];
  const tagMap = Object.fromEntries(tags.map(t => [t.key, t.value]));

  const lastSeen = issue.lastSeen ? new Date(issue.lastSeen).toLocaleString() : null;
  const firstSeen = issue.firstSeen ? new Date(issue.firstSeen).toLocaleString() : null;
  const events = `${issue.count.toLocaleString()} event${issue.count !== 1 ? 's' : ''}`;
  const users = issue.userCount > 0 ? ` affecting ${issue.userCount.toLocaleString()} user${issue.userCount !== 1 ? 's' : ''}` : '';

  const facts = [];
  if (tagMap['transaction'] || tagMap['url'])  facts.push(`**Affected endpoint:** \`${tagMap['transaction'] || tagMap['url']}\``);
  if (tagMap['environment'])                   facts.push(`**Environment:** ${tagMap['environment']}`);
  facts.push(`**Frequency:** ${events}${users}`);
  if (lastSeen)                                facts.push(`**Last seen:** ${lastSeen}`);
  if (firstSeen && firstSeen !== lastSeen)     facts.push(`**First seen:** ${firstSeen}`);
  if (tagMap['runtime'] || tagMap['runtime.name']) {
    const rt = [tagMap['runtime.name'], tagMap['runtime']].filter(Boolean).join(' ');
    facts.push(`**Runtime:** ${rt}`);
  }
  if (tagMap['server_name'])                   facts.push(`**Server:** ${tagMap['server_name']}`);
  facts.push(`**Project:** ${issue.project}`);

  facts.forEach(f => lines.push(f));
  lines.push('');

  // ── Where it happens ──────────────────────────────────────────────────────
  if (exc) {
    const inAppFrames = (exc.frames || []).filter(f => f.inApp);
    const topFrame = inAppFrames[0];

    if (topFrame) {
      const shortFile = topFrame.filename.replace(/^.*?(\/modules\/|\/src\/|\/app\/|\/pages\/|\/resources\/)/, '$1');
      const location = `${shortFile}:${topFrame.lineno}`;
      lines.push(`### Where it happens`);
      lines.push(`In \`${topFrame.fn || topFrame.module || '(anonymous)'}\` at \`${location}\``);

      // Find the suspect line from context
      if (topFrame.context?.length) {
        const suspectPair = topFrame.context.find(([ln]) => ln === topFrame.lineno);
        if (suspectPair) {
          const code = suspectPair[1].trim();
          // Detect language from filename extension for fenced block
          const ext = topFrame.filename.match(/\.(\w+)$/)?.[1] || '';
          const lang = { php: 'php', js: 'js', ts: 'ts', tsx: 'tsx', jsx: 'jsx', py: 'python', rb: 'ruby' }[ext] || '';
          lines.push('');
          lines.push(`\`\`\`${lang}`);
          lines.push(`${code}  ← line ${topFrame.lineno}`);
          lines.push('```');
        }
      }
      lines.push('');
    }

    // Full in-app call chain (skip the top frame already shown)
    const remainingFrames = inAppFrames.slice(1, 5);
    if (remainingFrames.length) {
      lines.push(`**Call chain:**`);
      remainingFrames.forEach(f => {
        const sf = f.filename.replace(/^.*?(\/modules\/|\/src\/|\/app\/|\/pages\/|\/resources\/)/, '$1');
        lines.push(`- \`${f.fn || f.module || '(anonymous)'}\` → \`${sf}:${f.lineno}\``);
      });
      lines.push('');
    }
  } else if (issue.culprit) {
    lines.push(`### Where it happens`);
    lines.push(`\`${issue.culprit}\``);
    lines.push('');
  }

  // ── Root cause ────────────────────────────────────────────────────────────
  if (analysis?.rootCause) {
    lines.push(`### What went wrong`);
    lines.push(analysis.rootCause);
    lines.push('');
  }

  // ── Suggested fix ─────────────────────────────────────────────────────────
  if (analysis?.fix) {
    lines.push(`### Suggested fix`);
    lines.push(analysis.fix);
    lines.push('');
  }

  // ── Sentry link ───────────────────────────────────────────────────────────
  if (issue.permalink) {
    lines.push(`**Sentry:** ${issue.permalink}`);
  }

  return lines.join('\n').trim();
}

function sentryIssueBody(issue) {
  const detail = state.sentryDetailCache[issue.id];
  // If we have detail cached, produce a rich human-friendly brief; otherwise fall back to a
  // lightweight summary so the item is still useful without waiting for the async load.
  if (detail && !detail.error) {
    return generateSentryBrief(issue, detail);
  }

  // Minimal fallback (detail not yet loaded)
  const lines = [
    `## ${issue.title}`,
    '',
    issue.culprit ? `A \`${issue.level}\` occurred in \`${issue.culprit}\`.` : `A \`${issue.level}\`-level Sentry issue.`,
    '',
    `**Project:** ${issue.project}`,
    `**Frequency:** ${issue.count.toLocaleString()} events, ${issue.userCount.toLocaleString()} users affected`,
    issue.lastSeen ? `**Last seen:** ${new Date(issue.lastSeen).toLocaleString()}` : '',
    issue.permalink ? `**Sentry:** ${issue.permalink}` : ''
  ].filter(Boolean);

  return lines.join('\n');
}

async function addSentryIssueToMyList(id) {
  const issue = state.sentryIssues.find(i => i.id === id);
  if (!issue) return;

  const mappedRepos = SENTRY_PROJECT_REPO_MAP[issue.project] || [];
  const labels = [...new Set([issue.project, issue.level, 'sentry', ...mappedRepos])].filter(Boolean);

  // If detail isn't cached yet, fetch it now so we can write a rich brief.
  if (!state.sentryDetailCache[issue.id]) {
    toast('Generating brief — fetching Sentry detail…', 'info');
    await loadSentryIssueDetail(id);
  }

  addMyListItem(issue.title, sentryIssueBody(issue), labels);
  toast(`"${issue.title.slice(0, 60)}" added to My List.`, 'success');
}

// Tracks in-flight detail promises so multiple callers can await the same request.
const _sentryDetailPromises = {};

async function loadSentryIssueDetail(id) {
  if (state.sentryDetailCache[id]) return;
  // If a fetch is already in-flight, return the same promise so callers can await it.
  if (_sentryDetailPromises[id]) return _sentryDetailPromises[id];

  state.sentryDetailLoading.add(id);
  _sentryDetailPromises[id] = (async () => {
    try {
      const data = await api(`/api/sentry/issues/${encodeURIComponent(id)}`);
      state.sentryDetailCache[id] = data;
    } catch (err) {
      state.sentryDetailCache[id] = { error: err.message, tags: [], exceptions: [], errors: [] };
    } finally {
      state.sentryDetailLoading.delete(id);
      delete _sentryDetailPromises[id];
      if (state.selectedSentryId === id) renderSentryDetail();
    }
  })();

  return _sentryDetailPromises[id];
}

function ensureSentryLoaded() {
  if (state.sentryLoaded || state.sentryLoading) return;
  loadSentryIssues();
}

els.sentryLoadButton?.addEventListener('click', loadSentryIssues);

els.sentrySearch?.addEventListener('input', event => {
  state.sentryFilter = event.target.value;
  renderSentryIssues();
});

els.sentryProjectFilter?.addEventListener('change', event => {
  state.sentryProjectFilter = event.target.value;
  renderSentryIssues();
});

els.sentryLevelFilter?.addEventListener('change', event => {
  state.sentryLevelFilter = event.target.value;
  renderSentryIssues();
});

els.sentryList?.addEventListener('click', event => {
  const row = event.target.closest('[data-sentry-id]');
  if (!row) return;
  state.selectedSentryId = row.dataset.sentryId;
  renderSentryIssues();
});

els.sentryDetail?.addEventListener('click', event => {
  const btn = event.target.closest('[data-sentry-detail-action]');
  if (!btn) return;
  const issue = selectedSentryIssue();
  if (!issue) return;

  if (btn.dataset.sentryDetailAction === 'add') {
    addSentryIssueToMyList(issue.id);
  }

  if (btn.dataset.sentryDetailAction === 'workspace') {
    addSentryIssueToMyList(issue.id);
    // Pre-fill builder and switch to issues view
    const items = loadMyList();
    const item = items.find(i => i.title === issue.title);
    if (item) useMyListItem(item.id);
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────

refresh();
