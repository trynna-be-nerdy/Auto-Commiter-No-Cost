import Anthropic from '@anthropic-ai/sdk';
import type { Config } from './config.js';

const CHARS_PER_TOKEN = 4;

const SYSTEM_PROMPT = `You are a Git commit message generator. Generate ONLY a conventional commit message.

Rules:
- Format: <type>(<optional scope>): <description> (max 72 chars on subject line)
- Optional body after a blank line for additional context
- Types: feat, fix, chore, refactor, docs, style, test, perf
- Infer the type and description solely from the provided diff
- Never hallucinate file names or changes not present in the diff
- Be concise and specific

Output ONLY the commit message — no explanation, no markdown, no quotes.`;

export class ClaudeService {
  private client: Anthropic;
  private claudeConfig: Config['claude'];

  constructor(claudeConfig: Config['claude']) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('[auto-commit] ANTHROPIC_API_KEY environment variable is not set.');
    }
    this.client = new Anthropic({ apiKey });
    this.claudeConfig = claudeConfig;
  }

  async generateCommitMessage(diff: string): Promise<string> {
    const model = this.selectModel(diff.length);

    for (let attempt = 0; attempt <= this.claudeConfig.maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model,
          max_tokens: 300,
          system: [
            {
              type: 'text',
              text: SYSTEM_PROMPT,
              // Cache the stable system prompt — saves tokens on every commit
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [
            {
              role: 'user',
              content: `Generate a commit message for this diff:\n\n${diff}`,
            },
          ],
        });

        this.logUsage(model, response.usage);

        const textBlock = response.content.find((b) => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
          throw new Error('No text block in Claude response.');
        }

        return textBlock.text.trim();
      } catch (err) {
        const isRetryable =
          err instanceof Anthropic.InternalServerError ||
          err instanceof Anthropic.APIConnectionError ||
          err instanceof Anthropic.APIConnectionTimeoutError;

        if (isRetryable && attempt < this.claudeConfig.maxRetries) {
          console.warn(`[auto-commit] Claude API error (attempt ${attempt + 1}), retrying...`);
          continue;
        }

        console.error(`[auto-commit] Claude API failed after ${attempt + 1} attempt(s): ${err}`);
        return this.fallbackMessage();
      }
    }

    return this.fallbackMessage();
  }

  private selectModel(diffChars: number): string {
    const diffTokens = diffChars / CHARS_PER_TOKEN;
    return diffTokens < this.claudeConfig.largeDiffThresholdTokens
      ? this.claudeConfig.defaultModel
      : this.claudeConfig.largeModel;
  }

  private logUsage(model: string, usage: Anthropic.Usage): void {
    console.log(
      `[auto-commit] Claude usage — model: ${model}, ` +
        `input: ${usage.input_tokens}, output: ${usage.output_tokens}, ` +
        `cache_write: ${usage.cache_creation_input_tokens ?? 0}, ` +
        `cache_read: ${usage.cache_read_input_tokens ?? 0}`
    );
  }

  private fallbackMessage(): string {
    return `chore: auto-commit ${new Date().toISOString()}`;
  }
}
