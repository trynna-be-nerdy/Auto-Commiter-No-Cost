# Product Requirements Document: Auto-Commit System

## Overview

A local background service that watches a Git repository for file changes, automatically stages changed files, generates a conventional commit message using rule-based diff analysis, commits, and pushes to GitHub — with zero manual intervention and zero API costs.

---

## Goals

- Eliminate manual `git add / commit / push` toil for personal or solo projects.
- Produce meaningful, structured commit messages derived entirely from the diff — no external API, no cost, no latency.
- Run silently in the background with minimal resource usage.
- Be configurable so the user can tune watch paths, debounce timing, and push behavior.

---

## Non-Goals

- Multi-user or team collaboration workflows (no PR creation, no branch management beyond push).
- Support for non-Git version control systems.
- A GUI or web dashboard (CLI + config file is sufficient for v1).
- AI-generated commit messages (deliberately out of scope — rule-based is free and instant).

---

## System Components

### 1. File Watcher

**What it does:** Monitors the repository working tree for any create, modify, rename, or delete events.

**Requirements:**
- Use `chokidar` for cross-platform file watching.
- Respect a user-supplied ignore list so `node_modules/`, `dist/`, `.git/`, logs, etc. are excluded.
- Implement a configurable debounce window (default: 10 seconds) so rapid successive saves are batched into one commit.
- Emit a "batch ready" event after the debounce window closes with no further changes.

### 2. Git Staging & Diff Extraction

**What it does:** Stages changed files and captures the diff for analysis.

**Requirements:**
- Run `git add -A` after the debounce window fires.
- Run `git diff --cached` to produce the staged diff text.
- If the diff is empty (nothing actually changed in Git's view), skip the commit cycle silently.

### 3. Rule-Based Commit Message Generator

**What it does:** Parses the staged diff and produces a conventional commit message with zero external dependencies.

**Requirements:**
- Parse `diff --git` headers to extract file paths and change status (added / modified / deleted / renamed).
- Detect commit type using ordered heuristics:
  1. All test files → `test`
  2. All docs/markdown → `docs`
  3. All style files → `style`
  4. All config/tooling files → `chore`
  5. Any new source file → `feat`
  6. Diff contains fix/bug/error/patch keywords → `fix`
  7. Fallback → `chore`
- Scope = longest common parent directory of changed files.
- Description = `add X`, `update Y`, `remove Z` (max 3 file names, then `+N more`).
- Subject line truncated to 72 characters.
- Output format: `<type>(<scope>): <description>`
- No external API calls, no network, no cost.

### 4. Git Commit & Push

**What it does:** Creates the commit and syncs to GitHub.

**Requirements:**
- Run `git commit -m "<generated message>"`.
- After a successful commit, run `git push` to the configured remote and branch.
- If push fails (e.g., upstream diverged), log the error and leave the commit local — do not force-push.
- Configurable option to disable auto-push and only auto-commit.

### 5. Configuration File

**What it does:** Single source of truth for all tunable parameters.

**File:** `.auto-commit.json` in the repository root (git-ignored).

**Fields:**
```json
{
  "watchPaths": ["."],
  "ignorePatterns": ["node_modules", "dist", ".git", "*.log", ".auto-commit.log"],
  "debounceSeconds": 10,
  "autoPush": true,
  "remoteName": "origin",
  "branch": "main"
}
```

### 6. Service / Process Management

**What it does:** Keeps the watcher running persistently.

**Requirements:**
- Ship a startup script (`start.sh` / `start.ps1`) that launches the process.
- Support running as a background process via `pm2`.
- Write structured JSON logs to `.auto-commit.log` (rotated at 5 MB).
- Expose a `--dry-run` flag that prints what would be committed/pushed without executing Git commands.

---

## Technical Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 20 LTS |
| Language | TypeScript |
| File watching | chokidar |
| Git operations | simple-git |
| Commit message | Rule-based diff parser (no external dependency) |
| Process management | pm2 |
| Config validation | zod |

---

## Data Flow

```
File saved
  → Debounce window resets
    → (window expires with no new changes)
      → git add -A
        → git diff --cached  (empty? → skip)
          → Rule-based parser analyses diff
            → Commit message generated instantly
              → git commit -m "<message>"
                → git push origin <branch>
                  → Log result
```

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `AUTO_COMMIT_CONFIG` | Optional. Override path to `.auto-commit.json`. |

No API keys required.

---

## Error Handling & Edge Cases

| Scenario | Behavior |
|---|---|
| Push rejected (non-fast-forward) | Log warning; commit remains local. Do not force-push. |
| Repo has uncommitted merge conflict | Skip cycle; log "merge conflict detected, skipping". |
| Watcher process crashes | pm2 restarts it automatically. |
| `.auto-commit.json` missing | Use built-in defaults; warn on startup. |
| Batch triggered while previous still processing | Skip; log "already in progress". |

---

## Security Considerations

- `.auto-commit.json` is git-ignored.
- No API keys or secrets required — the system is entirely local.
- No source code is transmitted to any external service.

---

## Success Metrics (v1)

- Watcher starts and detects changes within 1 second of a file save.
- Commit message is generated and commit completes within 15 seconds of the debounce window closing.
- Zero manual `git commit` commands required during a normal coding session.
- Zero API cost per commit.

---

## Out of Scope for v1 (future work)

- Branch-per-feature auto-creation.
- PR auto-creation via GitHub API.
- GUI tray icon / desktop notifications.
- Support for monorepos with per-package commits.
- Commit signing (GPG).
- Optional AI-enhanced messages via Ollama (local LLM).
