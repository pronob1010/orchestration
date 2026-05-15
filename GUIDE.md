# User Guide

This guide walks through the full workflow from opening the UI to cleaning up after a merge.

---

## Table of contents

1. [Starting the server](#1-starting-the-server)
2. [The layout](#2-the-layout)
3. [Picking an issue](#3-picking-an-issue)
4. [Selecting repos](#4-selecting-repos)
5. [Configuring the workspace](#5-configuring-the-workspace)
6. [Creating the workspace](#6-creating-the-workspace)
7. [The worker brief](#7-the-worker-brief)
8. [Working in the worktree](#8-working-in-the-worktree)
9. [Managing workspaces](#9-managing-workspaces)
10. [Cleanup and purge](#10-cleanup-and-purge)
11. [PR review tab](#11-pr-review-tab)
12. [Keyboard shortcuts](#12-keyboard-shortcuts)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Starting the server

```bash
cd orchestration
node server.js
```

Open **http://127.0.0.1:4177** in your browser.

The topbar shows **Connected** (green pill) once the server responds. If it shows **Offline**, check the terminal for errors.

**With custom env vars:**

```bash
GITHUB_ISSUES_REPO=my-org/my-repo \
ORCHESTRATOR_BASE_REF=origin/main \
ISSUE_WORKSPACE_ROOT=~/issues \
node server.js
```

---

## 2. The layout

```
┌──────────────────────────────────────────────────────────────┐
│ Rail  │  Topbar (title · status · theme · refresh)           │
│       ├──────────────────────────────────────────────────────│
│  nav  │  [ Issues tab ]  [ Pull Requests tab ]               │
│       ├────────────────────┬─────────────────────────────────│
│       │  Create Workspace  │  Open Issues                    │
│       │  form              │  Issue detail + worker brief    │
│       │                    │  Select repos                   │
│       ├────────────────────┴─────────────────────────────────│
│       │  Worktree command preview                            │
│       │  Active workspaces                                   │
└──────────────────────────────────────────────────────────────┘
```

On screens wider than 1280 px the form panel sticks to the left while issues, brief, and repos scroll on the right.

---

## 3. Picking an issue

### From the GitHub issue list

1. The **Open Issues** panel loads automatically on startup.
2. Use the **search box** to filter by title, number, label, or assignee.
3. Use the **Assignee** dropdown to show only your issues (**Mine**) or unassigned ones.
4. Click any issue row to select it.

Selecting an issue automatically:
- Fills in the **Issue** and **Title** fields on the form
- Generates a branch name (`fix/<title-slug>-issue-<number>`)
- Suggests relevant repos based on the issue title and body
- Generates a worker brief

### Manually

If the issue isn't in the list (wrong repo, private, etc.) you can type directly into the **Issue** field on the form:

- Type a number: `2981` → slug becomes `issue-2981`
- Type a slug: `issue-2981` → used as-is
- Type anything else: prefixed with `issue-`

---

## 4. Selecting repos

The **Select Worktrees** panel lists every git repo found in the workspace root.

### Auto-suggestions

After you select an issue the UI scores each repo against the issue text using keyword rules. Suggested repos appear with a **suggested** badge and are pre-checked.

Click **Apply Suggestions** to add all suggested repos to your selection, or click individual checkboxes to adjust.

Click **Clear Suggested** to remove only the auto-suggested ones (leaving any you manually added).

### Manual selection helpers

| Button | What it does |
|---|---|
| **Dirty** | Selects all repos that have uncommitted changes |
| **All** | Selects every repo visible in the current filter |
| **Clear** | Deselects everything |

Use the **Filter repos** search box to narrow the list by name, branch, or tech stack.

### Reading the repo row

```
☑  auth-service
   main · yarn
   /projects/workspace/auth-service
                          [suggested] [2 dirty] [Node/TS]
```

- **Branch** — current branch in the base repo (not the worktree)
- **Dirty count** — uncommitted files in the base repo
- **Tech tags** — detected stack (Laravel, Next.js, Node/TS, etc.)

---

## 5. Configuring the workspace

| Field | Description |
|---|---|
| **Issue** | Issue number or slug. Required. |
| **Title** | Human-readable title. Used to generate the branch name. |
| **Branch** | Auto-generated from title + issue number. Edit to override. |
| **Base ref** | The git ref to branch from. Defaults to `origin/develop`. |
| **Fetch remote** | When checked, runs `git fetch --prune origin` before creating each worktree. Recommended. |
| **Orchestrator / Worker / Observer / Standards** | Agent lanes — recorded in workspace metadata and included in the worker brief. |

### Branch name rules

The branch is generated as:

```
fix/<title-slug>-issue-<number>
```

Examples:
- Title `"Cart total wrong"`, issue `2981` → `fix/cart-total-wrong-issue-2981`
- No title, issue `2981` → `fix/issue-2981-issue-2981` (edit the title to get a better name)

Once you manually edit the Branch field, auto-generation stops (the field is "touched"). Clear it to re-enable auto-generation.

### Base ref fallback

If the specified base ref doesn't exist in a repo, the server tries these in order:

1. Your configured value (e.g. `origin/develop`)
2. The remote's actual default branch (`refs/remotes/origin/HEAD`)
3. `origin/main`
4. `origin/master`
5. `develop`
6. `main`
7. `master`

If none exist the workspace creation fails for that repo with a clear error.

---

## 6. Creating the workspace

Click **Create Workspace** (or press `Cmd+Enter`).

The button spins and a **live log** appears below it showing each step as it happens:

```
10:42:01  auth-service    git fetch --prune origin
10:42:03  auth-service    git worktree add .../issue-2981/auth-service -b fix/...
10:42:04  payment-service git fetch --prune origin
10:42:07  payment-service git worktree add .../issue-2981/payment-service -b fix/...
```

On success:
- A toast confirms the workspace slug
- The workspace appears in the **Issue Workspaces** panel
- The log fades after 3 seconds

On failure:
- The log stays visible showing where it failed
- Any worktrees already created are **rolled back automatically**
- The workspace is marked `failed` in the metadata

---

## 7. The worker brief

The **Issue Context** panel generates a structured prompt for an AI coding agent. It updates live as you change the issue, repos, branch, or base ref.

```
# Worker Brief

Issue: #2981 Cart total wrong on checkout
URL: https://github.com/my-org/my-repo/issues/2981
Workspace: /projects/workspace-issues/issue-2981
Base ref: origin/develop

Repos:
- payment-service: .../issue-2981/payment-service (fix/cart-total-wrong-issue-2981)
- dokan-cloud: .../issue-2981/dokan-cloud (fix/cart-total-wrong-issue-2981)

Context:
<stripped issue body>

Goal:
- Reproduce or understand the reported behavior.
- Implement the smallest correct fix.
...

Verification:
- payment-service: yarn lint
- payment-service: yarn test
- dokan-cloud: php artisan test
```

Click the **copy icon** (top right of the panel) to copy it to clipboard. The icon swaps to a checkmark for 1.5 s to confirm.

Paste the brief directly into Claude Code, Codex, or any agent's prompt.

---

## 8. Working in the worktree

Each worktree is a full working copy of the repo at the base ref, on its own branch.

```bash
cd /projects/workspace-issues/issue-2981/auth-service
# Make changes, commit normally
git add .
git commit -m "fix: token expiry on logout"
git push origin fix/cart-total-wrong-issue-2981
```

The worktree shares the git history with the base repo but has its own working tree and index. You can have the base repo open in one editor window and the worktree in another without conflicts.

### Opening from the UI

Each workspace card has quick-open buttons:

| Button | Opens |
|---|---|
| **Finder** | The issue folder in macOS Finder |
| **Terminal** | A Terminal window at the issue folder |
| **VS Code** | The issue folder in VS Code |
| **Claude Code** | A Terminal running `claude` in the issue folder |

---

## 9. Managing workspaces

The **Issue Workspaces** panel at the bottom of the page lists all workspaces, newest first.

Each card shows:
- Slug, title, and full path
- Status pill: `ready` · `creating` · `failed` · `cleaned` · `untracked`
- Base ref, agent worker, and repo count
- Per-repo branch and dirty/clean state (auto-refreshes every 30 s)

### Statuses

| Status | Meaning |
|---|---|
| `ready` | Worktrees exist and are usable |
| `creating` | Creation is in progress |
| `failed` | Creation failed (check logs in `ISSUE_WORKSPACE.json`) |
| `cleaned` | Worktrees removed, directory still exists |
| `untracked` | Directory found but no `ISSUE_WORKSPACE.json` |

---

## 10. Cleanup and purge

### Cleanup

Click **Cleanup** on a `ready` workspace when the PR is merged.

This runs `git worktree remove` and `git branch -d` for each repo. Git will **refuse** to remove a worktree that has uncommitted changes — you must commit or stash first.

After cleanup the status changes to `cleaned`.

### Purge

Click **Purge** on a `cleaned` workspace to permanently delete the issue directory from disk.

This is irreversible. You will be asked to confirm.

---

## 11. PR review tab

Click **Pull Requests** in the top tab bar to switch to the PR review view.

This tab loads open PRs across all repos in the workspace. You can:

- Filter by repo, author, or review state
- Select a primary PR and related PRs
- Add reviewer context notes
- Copy a structured review prompt for an AI reviewer

The review prompt covers all selected PRs as one change set and asks the reviewer to flag correctness issues, dependency risks between PRs, missing test coverage, and verification gaps.

---

## 12. Keyboard shortcuts

| Key | Action |
|---|---|
| `R` | Refresh all data |
| `T` | Toggle dark / light mode |
| `/` | Focus issue search |
| `Esc` | Clear repo selection |
| `Cmd+Enter` | Submit the Create Workspace form |

Shortcuts are disabled when focus is inside an input, select, or textarea.

---

## 13. Troubleshooting

### "No usable base ref found"

The specified base ref (and all fallbacks) don't exist in that repo.

**Fix:** Enable **Fetch remote** on the form so the server fetches from origin before creating the worktree. If you're on an unusual branch name (e.g. `trunk`), type it directly in the **Base ref** field.

### "Branch already exists in \<repo\>"

A branch with the same name already exists in the base repo.

**Fix:** Edit the **Branch** field to use a different name, or delete the existing branch first: `git branch -d fix/...`

### "Workspace already exists"

A workspace directory with that slug already exists.

**Fix:** Either use a different issue ID, or run **Cleanup → Purge** on the existing workspace first.

### Issues list shows "Error"

The GitHub CLI (`gh`) is not authenticated or `GITHUB_ISSUES_REPO` is not set.

**Fix:** Run `gh auth login` in your terminal, or set `GITHUB_TOKEN` and `GITHUB_ISSUES_REPO` before starting the server.

### Server shows "Offline" in the UI

The browser can't reach the server.

**Fix:** Check the terminal where `node server.js` is running. Restart it if it crashed. Make sure the port isn't already in use (`lsof -i :4177`).

### Cleanup fails with "worktree has changes"

The worktree has uncommitted or unstaged changes.

**Fix:** Go into the worktree directory, commit or stash the changes, then retry cleanup.
