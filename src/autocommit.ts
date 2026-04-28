import { loadConfig, type Config } from './config.js';
import { FileWatcher } from './watcher.js';
import { GitService } from './git.js';
import { generateCommitMessage } from './commit-message.js';
import { logger } from './logger.js';

export class AutoCommitService {
  private config!: Config;
  private watcher: FileWatcher = new FileWatcher();
  private git!: GitService;
  private isProcessing = false;
  private repoRoot: string;
  private dryRun: boolean;
  private installSubdir: string | null;

  constructor(repoRoot: string = process.cwd(), dryRun = false, installSubdir: string | null = null) {
    this.repoRoot = repoRoot;
    this.dryRun = dryRun;
    this.installSubdir = installSubdir;
  }

  async start(): Promise<void> {
    this.config = loadConfig(this.repoRoot);
    this.git = new GitService(this.repoRoot, this.dryRun);

    // When installed as a subdirectory of another repo, automatically ignore
    // the git-auto-commit folder itself so the tool doesn't watch its own files.
    if (this.installSubdir && !this.config.ignorePatterns.includes(this.installSubdir)) {
      this.config.ignorePatterns.push(this.installSubdir);
      logger.info(`Auto-ignoring install directory: ${this.installSubdir}`);
    }

    logger.info(
      `Service started — watching: ${this.config.watchPaths.join(', ')} | ` +
        `debounce: ${this.config.debounceSeconds}s | autoPush: ${this.config.autoPush}` +
        (this.dryRun ? ' | DRY-RUN' : '')
    );

    this.watcher.start(this.repoRoot, this.config, (paths) => {
      logger.info(`Batch ready (${paths.length} file(s) changed).`);
      this.processBatch().catch((err) =>
        logger.error(`Unhandled error in processBatch: ${err}`)
      );
    });
  }

  stop(): void {
    this.watcher.stop();
    logger.info('Service stopped.');
  }

  private async processBatch(): Promise<void> {
    if (this.isProcessing) {
      logger.info('Batch already in progress, skipping.');
      return;
    }

    this.isProcessing = true;

    try {
      if (await this.git.hasUnresolvedConflicts()) {
        logger.warn('Merge conflict detected — skipping commit cycle.');
        return;
      }

      await this.git.stageAll();

      const diff = await this.git.getStagedDiff(100_000);
      if (!diff) {
        logger.info('Nothing staged after git add — skipping.');
        return;
      }

      const message = generateCommitMessage(diff);
      logger.info(`Commit message: "${message}"`);

      await this.git.commit(message);

      if (this.config.autoPush) {
        const pushed = await this.git.push(this.config.remoteName, this.config.branch);
        if (!pushed) {
          logger.warn(
            'Push failed — commit is saved locally. Resolve the upstream divergence and push manually.'
          );
        }
      }
    } catch (err) {
      logger.error('processBatch failed', { error: String(err) });
    } finally {
      this.isProcessing = false;
    }
  }
}
