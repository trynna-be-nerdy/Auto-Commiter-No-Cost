import 'dotenv/config';
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

async function main(): Promise<void> {
  const { dryRun, help } = parseArgs(process.argv);

  if (help) {
    console.log(HELP);
    process.exit(0);
  }

  if (dryRun) {
    console.log('[auto-commit] Dry-run mode — no Git commands will be executed.');
  }

  const service = new AutoCommitService(process.cwd(), dryRun);

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
