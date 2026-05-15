# Orchestrator UI

A zero-dependency local web UI for managing per-issue Git worktrees across a **multi-repo or microservices workspace**. Built for teams where a single issue touches multiple independent repos and who use AI coding agents (Claude Code, Codex, etc.).

![Node ≥ 18](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)
![No dependencies](https://img.shields.io/badge/dependencies-none-blue)
![License MIT](https://img.shields.io/badge/license-MIT-green)

---

## What it does

- Browses open GitHub issues and **auto-suggests which repos** are relevant based on keyword rules
- Creates **git worktrees** for one or more repos in a single click, all branched from the same base ref
- Generates a **worker brief** — a structured prompt you paste to an AI agent
- Shows **live creation progress** as each worktree is checked out
- Tracks all active workspaces with **cleanup and purge** actions
- Opens workspaces directly in **Finder, Terminal, VS Code, or Claude Code**
- **Dark mode**, keyboard shortcuts, collapsible panels, auto-refresh

---

## Requirements

- Node.js ≥ 18
- Git
- [GitHub CLI (`gh`)](https://cli.github.com/) — optional, used to list issues. Falls back to the GitHub REST API.

---

## Setup

### 1. Clone alongside your services

Place this repo **inside the parent directory** that contains all your service repos:

```bash
git clone https://github.com/pronob1010/orchestration
```

Your directory layout should look like this — works for both monorepos and microservice workspaces:

```
/projects/workspace/
  orchestration/        ← this tool
  api-service/          ← git repo
  auth-service/         ← git repo
  frontend/             ← git repo
  payment-service/      ← git repo
  ...
```

The tool auto-discovers every sibling folder that contains a `.git` directory.

### 2. Create a sibling issues directory

By default worktrees are created in a directory called `<workspace>-issues` next to your workspace:

```
/projects/
  workspace/            ← your services live here
    orchestration/
    api-service/
    auth-service/
  workspace-issues/     ← per-issue worktrees land here
    issue-2981/
      api-service/      ← worktree on fix/my-fix-issue-2981
      auth-service/     ← worktree on fix/my-fix-issue-2981
```

You can override the issues path with `ISSUE_WORKSPACE_ROOT` (see below).

### 3. Start the server

```bash
cd orchestration
node server.js
```

Then open **http://127.0.0.1:4177**

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `ORCHESTRATOR_PORT` | `4177` | Port to listen on |
| `ORCHESTRATOR_HOST` | `127.0.0.1` | Host to bind (keep loopback — no auth) |
| `ORCHESTRATOR_BASE_REF` | `origin/develop` | Default git base ref for new branches |
| `ISSUE_WORKSPACE_ROOT` | `../\<monorepo\>-issues` | Where worktrees are created |
| `GITHUB_ISSUES_REPO` | `owner/repo` | GitHub repo to load issues from |
| `GITHUB_TOKEN` | — | GitHub PAT (used if `gh` CLI is not available) |

Example:

```bash
ORCHESTRATOR_BASE_REF=origin/main \
GITHUB_ISSUES_REPO=my-org/my-repo \
ISSUE_WORKSPACE_ROOT=/tmp/my-issues \
node orchestrator-ui/server.js
```

---

## Configuring repo suggestion rules

Open `public/app.js` and edit `REPO_SUGGESTION_RULES`. Each rule maps keywords (matched against the issue title + body) to a list of repo names:

```js
const REPO_SUGGESTION_RULES = [
  {
    repos: ['frontend', 'api'],
    keywords: ['checkout', 'cart', 'payment']
  },
  {
    repos: ['api', 'auth-service'],
    keywords: ['login', 'token', 'session', 'auth']
  }
  // add more rules for your team's repos
];
```

Repo names must match the directory names inside your monorepo root.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `R` | Refresh all data |
| `T` | Toggle dark / light mode |
| `/` | Focus issue search |
| `Esc` | Clear repo selection |
| `Cmd+Enter` | Submit workspace form |

---

## Workspace lifecycle

```
Create → ready → (work happens in worktree) → Cleanup → Purge
```

1. **Create** — fetches origin, creates worktrees, writes `ISSUE_WORKSPACE.json` + `ISSUE_WORKSPACE.md`
2. **Cleanup** — runs `git worktree remove` + deletes the local branch. Git refuses if there are uncommitted changes.
3. **Purge** — deletes the workspace directory entirely. Only available after cleanup.

---

## Security note

The server binds to `127.0.0.1` by default and has **no authentication**. Do not expose it on a public or shared network interface. Setting `ORCHESTRATOR_HOST=0.0.0.0` will print a warning at startup.

---

## License

MIT
