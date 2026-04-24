import chokidar, { type FSWatcher } from 'chokidar';
import { resolve } from 'path';
import { logger } from './logger.js';
import type { Config } from './config.js';

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private changeBuffer: Set<string> = new Set();

  start(repoRoot: string, config: Config, onBatchReady: (paths: string[]) => void): void {
    if (this.watcher) {
      throw new Error('Watcher is already running. Call stop() first.');
    }

    const watchPaths = config.watchPaths.map((p) => resolve(repoRoot, p));
    const ignored = buildIgnoredPatterns(config.ignorePatterns);

    this.watcher = chokidar.watch(watchPaths, {
      ignored,
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
      cwd: repoRoot,
    });

    const handleEvent = (filePath: string) => {
      this.changeBuffer.add(filePath);
      logger.info(`Change detected: ${filePath}`);
      this.resetDebounce(config.debounceSeconds, () => {
        const paths = [...this.changeBuffer];
        this.changeBuffer.clear();
        onBatchReady(paths);
      });
    };

    this.watcher
      .on('add', handleEvent)
      .on('change', handleEvent)
      .on('unlink', handleEvent)
      .on('error', (err: unknown) => logger.error(`Watcher error: ${err}`));

    logger.info(
      `Watching ${watchPaths.join(', ')} (debounce: ${config.debounceSeconds}s)`
    );
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.changeBuffer.clear();
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    logger.info('Watcher stopped.');
  }

  private resetDebounce(debounceSeconds: number, callback: () => void): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      callback();
    }, debounceSeconds * 1000);
  }
}

function buildIgnoredPatterns(patterns: string[]): (string | RegExp)[] {
  return patterns.map((pattern) => {
    if (pattern.includes('*') || pattern.includes('/')) {
      return pattern;
    }
    return new RegExp(`(^|[\\\\/])${escapeRegExp(pattern)}([\\\\/]|$)`);
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
