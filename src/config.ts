import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';

const ClaudeConfigSchema = z.object({
  defaultModel: z.string().default('claude-haiku-4-5-20251001'),
  largeModel: z.string().default('claude-sonnet-4-6'),
  largeDiffThresholdTokens: z.number().default(4000),
  maxRetries: z.number().int().min(0).default(1),
});

const ConfigSchema = z.object({
  watchPaths: z.array(z.string()).default(['.']),
  ignorePatterns: z
    .array(z.string())
    .default(['node_modules', 'dist', '.git', '*.log', '.auto-commit.log']),
  debounceSeconds: z.number().positive().default(10),
  autoPush: z.boolean().default(true),
  remoteName: z.string().default('origin'),
  branch: z.string().default('main'),
  claude: ClaudeConfigSchema.default({
    defaultModel: 'claude-haiku-4-5-20251001',
    largeModel: 'claude-sonnet-4-6',
    largeDiffThresholdTokens: 4000,
    maxRetries: 1,
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(repoRoot: string = process.cwd()): Config {
  const configPath = resolve(
    process.env.AUTO_COMMIT_CONFIG ?? resolve(repoRoot, '.auto-commit.json')
  );

  if (!existsSync(configPath)) {
    console.warn(`[auto-commit] No config file found at ${configPath}, using defaults.`);
    return ConfigSchema.parse({});
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (err) {
    throw new Error(`[auto-commit] Failed to parse config at ${configPath}: ${err}`);
  }

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `[auto-commit] Invalid config at ${configPath}:\n${result.error.toString()}`
    );
  }

  return result.data;
}
