import { loadConfig, type Config } from './config.js';
import { FileWatcher } from './watcher.js';
import { GitService } from './git.js';
import { ClaudeService } from './claude.js';

export class AutoCommitService {
  private config!: Config;
  private watcher: FileWatcher = new FileWatcher();
  private git!: GitService;
  private claude!: ClaudeService;
  private isProcessing = false;
  private repoRoot: string;

  constructor(repoRoot: string = process.cwd()) {
    this.repoRoot = repoRoot;
  }

  async start(): Promise<void> {
    this.config = loadConfig(this.repoRoot);
    this.git = new GitService(this.repoRoot);
    this.claude = new ClaudeService(this.config.claude);

    console.log(
      `[auto-commit] Service started. Watching: ${this.config.watchPaths.join(', ')} ` +
        `| debounce: ${this.config.debounceSeconds}s ` +
        `| autoPush: ${this.config.autoPush}`
    );

    this.watcher.start(this.repoRoot, this.config, (paths) => {
      console.log(`[auto-commit] Batch ready (${paths.length} file(s) changed).`);
      this.processBatch().catch((err) =>
        console.error('[auto-commit] Unhandled error in processBatch:', err)
      );
    });
  }

  stop(): void {
    this.watcher.stop();
    console.log('[auto-commit] Service stopped.');
  }

  private async processBatch(): Promise<void> {
    if (this.isProcessing) {
      console.log('[auto-commit] Batch already in progress, skipping.');
      return;
    }

    this.isProcessing = true;

    try {
      if (await this.git.hasUnresolvedConflicts()) {
        console.warn('[auto-commit] Merge conflict detected — skipping commit cycle.');
        return;
      }

      await this.git.stageAll();

      const diff = await this.git.getStagedDiff(this.config.claude.largeDiffThresholdTokens);
      if (!diff) {
        console.log('[auto-commit] Nothing staged after git add — skipping.');
        return;
      }

      console.log(`[auto-commit] Diff preview: ${diff.slice(0, 200).replace(/\n/g, ' ')}...`);

      const message = await this.claude.generateCommitMessage(diff);
      console.log(`[auto-commit] Commit message: "${message}"`);

      await this.git.commit(message);

      if (this.config.autoPush) {
        const pushed = await this.git.push(this.config.remoteName, this.config.branch);
        if (!pushed) {
          console.warn(
            '[auto-commit] Push failed — commit is saved locally. ' +
              'Resolve the upstream divergence and push manually.'
          );
        }
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          source: 'auto-commit',
          message: 'processBatch failed',
          error: String(err),
          timestamp: new Date().toISOString(),
        })
      );
    } finally {
      this.isProcessing = false;
    }
  }
}
