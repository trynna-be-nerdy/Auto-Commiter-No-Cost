import { appendFileSync, existsSync, renameSync, statSync } from 'fs';
import { resolve } from 'path';

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

type Level = 'info' | 'warn' | 'error';

const CONSOLE: Record<Level, (...args: unknown[]) => void> = {
  info: console.log,
  warn: console.warn,
  error: console.error,
};

const PREFIX: Record<Level, string> = {
  info: '[auto-commit]',
  warn: '[auto-commit] WARN:',
  error: '[auto-commit] ERROR:',
};

class Logger {
  private logFile: string;

  constructor(logFile = '.auto-commit.log') {
    this.logFile = resolve(process.cwd(), logFile);
  }

  info(message: string, meta?: object): void {
    this.write('info', message, meta);
  }

  warn(message: string, meta?: object): void {
    this.write('warn', message, meta);
  }

  error(message: string, meta?: object): void {
    this.write('error', message, meta);
  }

  private write(level: Level, message: string, meta?: object): void {
    // Console output
    const metaSuffix = meta ? ` ${JSON.stringify(meta)}` : '';
    CONSOLE[level](`${PREFIX[level]} ${message}${metaSuffix}`);

    // File output
    this.rotate();
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(meta ?? {}),
    });
    try {
      appendFileSync(this.logFile, entry + '\n', 'utf-8');
    } catch {
      // Never crash the watcher because of a logging failure
    }
  }

  private rotate(): void {
    if (!existsSync(this.logFile)) return;
    try {
      if (statSync(this.logFile).size >= MAX_SIZE) {
        renameSync(this.logFile, this.logFile + '.1');
      }
    } catch {
      // Ignore rotation errors
    }
  }
}

export const logger = new Logger();
