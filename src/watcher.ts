import chokidar from 'chokidar';
import { resolve } from 'path';
import type { Config } from './config.js';

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private changeBuffer: Set<string> = new Set();

  start(repoRoot: string, config: Config, onBatchReady: (paths: string[]) => void): void {
    if (this.watcher) {
      throw new Error('Watcher is already running. Call stop() first.');
    }

    const watchPaths = config.watchPaths.map((p) => resolve(repoRoot, p));

    const ignored = buildIgnoredPatterns(config.ignorePatterns, repoRoot);

    this.watcher = chokidar.watch(watchPaths, {
      ignored,
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
      cwd: repoRoot,
    });

    const handleEvent = (filePath: string) => {
      this.changeBuffer.add(filePath);
      console.log(`[auto-commit] Change detected: ${filePath}`);
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
      .on('error', (err) => console.error(`[auto-commit] Watcher error: ${err}`));

    console.log(
      `[auto-commit] Watching ${watchPaths.join(', ')} (debounce: ${config.debounceSeconds}s)`
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
    console.log('[auto-commit] Watcher stopped.');
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

function buildIgnoredPatterns(patterns: string[], repoRoot: string): (string | RegExp)[] {
  return patterns.map((pattern) => {
    // Glob patterns with wildcards stay as-is; plain names get anchored to repo root
    if (pattern.includes('*') || pattern.includes('/')) {
      return pattern;
    }
    return new RegExp(
      `(^|[\\\\/])${escapeRegExp(pattern)}([\\\\/]|$)`
    );
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
