import { simpleGit, type SimpleGit } from 'simple-git';
import { logger } from './logger.js';

const CHARS_PER_TOKEN = 4;

export class GitService {
  private git: SimpleGit;
  private dryRun: boolean;

  constructor(repoPath: string, dryRun = false) {
    this.git = simpleGit(repoPath);
    this.dryRun = dryRun;
  }

  async hasUnresolvedConflicts(): Promise<boolean> {
    const status = await this.git.status();
    const conflictStates = ['AA', 'UU', 'DD', 'AU', 'UA', 'DU', 'UD'];
    return status.files.some((f) => conflictStates.includes(f.index + f.working_dir));
  }

  async stageAll(): Promise<void> {
    if (this.dryRun) {
      logger.info('[dry-run] Would run: git add -A');
      return;
    }
    logger.info('Staging all changes...');
    await this.git.add('-A');
  }

  async getStagedDiff(maxTokens: number): Promise<string | null> {
    const diff = await this.git.diff(['--cached']);
    if (!diff.trim()) return null;

    const maxChars = maxTokens * CHARS_PER_TOKEN;
    if (diff.length <= maxChars) return diff;

    logger.warn(`Diff truncated from ${diff.length} to ${maxChars} chars (~${maxTokens} tokens).`);
    return diff.slice(0, maxChars) + '\n\n[... diff truncated, exceeded token limit ...]';
  }

  async commit(message: string): Promise<void> {
    if (this.dryRun) {
      logger.info(`[dry-run] Would run: git commit -m "${message}"`);
      return;
    }
    logger.info(`Committing: "${message}"`);
    await this.git.commit(message);
  }

  async push(remote: string, branch: string): Promise<boolean> {
    if (this.dryRun) {
      logger.info(`[dry-run] Would run: git push ${remote} ${branch}`);
      return true;
    }
    try {
      logger.info(`Pushing to ${remote}/${branch}...`);
      await this.git.push(remote, branch);
      logger.info('Push succeeded.');
      return true;
    } catch (err) {
      logger.error(`Push failed (commit is saved locally): ${err}`);
      return false;
    }
  }
}
