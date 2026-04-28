import 'dotenv/config';
import path from 'path';
import { simpleGit } from 'simple-git';
import { AutoCommitService } from './autocommit.js';

const HELP = `
auto-commit — automatically stage, commit, and push file changes

Usage:
  node dist/index.js [options]

Options:
  --dry-run   Show what would be staged/committed/pushed without executing
  --help      Show this help message
`.trim();

function parseArgs(argv: string[]): { dryRun: boolean; help: boolean } {
  const args = argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    help: args.includes('--help') || args.includes('-h'),
  };
}

/**
 * Resolves the git repository root from the current working directory.
 * If git-auto-commit is installed inside a subdirectory of another repo,
 * this returns the outer repo root so the service watches the whole project.
 *
 * Also returns the relative path from the repo root to the install location
 * so it can be auto-added to ignorePatterns.
 */
async function resolveRepoRoot(): Promise<{ repoRoot: string; installSubdir: string | null }> {
  const cwd = process.cwd();
  try {
    const git = simpleGit(cwd);
    const repoRoot = (await git.revparse(['--show-toplevel'])).trim();
    const installSubdir = repoRoot !== cwd ? path.relative(repoRoot, cwd) : null;
    return { repoRoot, installSubdir };
  } catch {
    // Not inside a git repo — fall back to cwd
    return { repoRoot: cwd, installSubdir: null };
  }
}

async function main(): Promise<void> {
  const { dryRun, help } = parseArgs(process.argv);

  if (help) {
    console.log(HELP);
    process.exit(0);
  }

  if (dryRun) {
    console.log('[auto-commit] Dry-run mode — no Git commands will be executed.');
  }

  const { repoRoot, installSubdir } = await resolveRepoRoot();

  // Switch working directory to the repo root so all relative paths
  // (config file, log file, git operations) resolve correctly even when
  // git-auto-commit is installed in a subdirectory of the target project.
  process.chdir(repoRoot);

  if (installSubdir) {
    console.log(`[auto-commit] Detected subdirectory install — watching repo root: ${repoRoot}`);
  }

  const service = new AutoCommitService(repoRoot, dryRun, installSubdir);

  process.on('SIGINT', () => {
    console.log('\n[auto-commit] Shutting down (SIGINT)...');
    service.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[auto-commit] Shutting down (SIGTERM)...');
    service.stop();
    process.exit(0);
  });

  await service.start();
}

main().catch((err) => {
  console.error('[auto-commit] Fatal error:', err);
  process.exit(1);
});
