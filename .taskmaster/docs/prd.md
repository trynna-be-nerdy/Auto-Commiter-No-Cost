# Product Requirements Document: Claude-Powered Auto-Commit System

## Overview

A local background service that watches a Git repository for file changes, automatically stages changed files, generates an intelligent commit message using the Claude API, commits, and pushes/syncs to GitHub — with zero manual intervention.

---

## Goals

- Eliminate manual `git add / commit / push` toil for personal or solo projects.
- Produce meaningful, AI-generated commit messages that describe *what changed and why* (inferred from the diff).
- Run silently in the background with minimal resource usage.
- Be configurable so the user can tune watch paths, debounce timing, push behavior, and Claude model.

---

## Non-Goals

- Multi-user or team collaboration workflows (no PR creation, no branch management beyond push).
- Support for non-Git version control systems.
- A GUI or web dashboard (CLI + config file is sufficient for v1).

---

## System Components

### 1. File Watcher

**What it does:** Monitors the repository working tree for any create, modify, rename, or delete events.

**Requirements:**
- Use a cross-platform file-watching library (e.g., `chokidar` for Node.js or `watchdog` for Python).
- Respect `.gitignore` and a user-supplied ignore list so `node_modules/`, build artifacts, etc. are excluded.
- Implement a configurable debounce window (default: 10 seconds) so rapid successive saves are batched into one commit rather than creating noise.
- Emit a "batch ready" event after the debounce window closes with no further changes.

### 2. Git Staging & Diff Extraction

**What it does:** Stages changed files and captures the diff to feed into Claude.

**Requirements:**
- Run `git add -A` (or a scoped variant) after the debounce window fires.
- Run `git diff --cached` to produce the staged diff text.
- If the diff is empty (nothing actually changed in Git's view), skip the commit cycle silently.
- Limit diff size sent to Claude — truncate or summarize files larger than a configurable threshold (default: 4 000 tokens) to stay within context limits.

### 3. Claude Commit Message Generator

**What it does:** Sends the diff to the Claude API and returns a structured commit message.

**Requirements:**
- Use the Anthropic Node.js / Python SDK.
- Default model: `claude-haiku-4-5-20251001` (fast, cheap for small diffs); fall back to `claude-sonnet-4-6` for large diffs.
- System prompt instructs Claude to:
  - Output **only** a conventional-commits-style message: one subject line (≤72 chars) + optional body.
  - Infer the commit type (`feat`, `fix`, `chore`, `refactor`, `docs`, `style`, `test`) from the diff.
  - Never hallucinate file names; derive everything from the provided diff.
- Implement prompt caching on the system prompt to reduce token costs on repeat calls.
- Retry once on transient API errors (5xx, timeout) before falling back to a timestamped default message (`chore: auto-commit <ISO timestamp>`).
- Surface the generated message to the console before committing so the user can see what was produced.

### 4. Git Commit & Push

**What it does:** Creates the commit and syncs to GitHub.

**Requirements:**
- Run `git commit -m "<generated message>"`.
- After a successful commit, run `git push` to the configured remote and branch.
- If push fails (e.g., upstream diverged), log the error and leave the commit local — do not force-push.
- Configurable option to disable auto-push and only auto-commit (push manually).

### 5. Configuration File

**What it does:** Single source of truth for all tunable parameters.

**File:** `.auto-commit.json` in the repository root (git-ignored).

**Fields:**
```json
{
  "watchPaths": ["."],
  "ignorePatterns": ["node_modules", "dist", ".git", "*.log"],
  "debounceSeconds": 10,
  "autoPush": true,
  "remoteName": "origin",
  "branch": "main",
  "claude": {
    "defaultModel": "claude-haiku-4-5-20251001",
    "largeModel": "claude-sonnet-4-6",
    "largeDiffThresholdTokens": 4000,
    "maxRetries": 1
  }
}
```

### 6. Service / Process Management

**What it does:** Keeps the watcher running persistently.

**Requirements:**
- Ship a startup script (`start.sh` / `start.ps1`) that launches the process.
- Support running as a background process via `pm2` (Node) or `systemd` / Windows Task Scheduler.
- Write structured JSON logs to `.auto-commit.log` (rotated at 5 MB).
- Expose a `--dry-run` flag that prints what would be committed/pushed without executing Git commands — useful for testing.

---

## Technical Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 20 LTS |
| Language | TypeScript |
| File watching | chokidar |
| Git operations | simple-git (Node.js wrapper) |
| Claude integration | @anthropic-ai/sdk |
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
          → Claude API (diff as user message)
            → Commit message returned
              → git commit -m "<message>"
                → git push origin <branch>
                  → Log result
```

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Required. Authenticates Claude API calls. |
| `AUTO_COMMIT_CONFIG` | Optional. Override path to `.auto-commit.json`. |

---

## Error Handling & Edge Cases

| Scenario | Behavior |
|---|---|
| Claude API unavailable | Fall back to timestamped default message; still commit + push. |
| Push rejected (non-fast-forward) | Log warning; commit remains local. Do not force-push. |
| Repo has uncommitted merge conflict | Skip cycle; log "merge conflict detected, skipping". |
| Watcher process crashes | pm2 restarts it automatically. |
| `.auto-commit.json` missing | Use built-in defaults; warn on startup. |
| Diff exceeds token limit | Truncate to threshold; note truncation in Claude prompt. |

---

## Security Considerations

- `.auto-commit.json` is git-ignored to prevent committing API keys or custom ignore rules.
- `ANTHROPIC_API_KEY` is read from the environment, never hard-coded.
- The diff sent to Claude may contain source code; users should be aware their code is transmitted to Anthropic's API.

---

## Success Metrics (v1)

- Watcher starts and detects changes within 1 second of a file save.
- Commit message is generated and commit completes within 15 seconds of the debounce window closing.
- Zero manual `git commit` commands required during a normal coding session.
- Claude API cost per commit < $0.001 on average (Haiku model).

---

## Out of Scope for v1 (future work)

- Branch-per-feature auto-creation.
- PR auto-creation via GitHub API.
- GUI tray icon / desktop notifications.
- Support for monorepos with per-package commits.
- Commit signing (GPG).
