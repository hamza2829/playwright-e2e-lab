import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { MockAdapter } from './adapters/mock.ts';
import { OllamaAdapter } from './adapters/ollama.ts';
import type { DraftAdapter } from './adapters/types.ts';
import { draftAll, REPO_ROOT } from './draft.ts';
import { evaluate, toMarkdown } from './evaluate.ts';
import { loadStories } from './story.ts';

/**
 * Usage:
 *   tsx genai/src/cli.ts draft    [--adapter mock|ollama] [--out dir] [--only slug,slug] [--save-prompts]
 *   tsx genai/src/cli.ts evaluate [--adapter mock|ollama] [--drafts dir] [--results results.json] [--out report.md]
 */

const adapters: Record<string, () => DraftAdapter> = {
  mock: () => new MockAdapter(),
  ollama: () => new OllamaAdapter(),
};

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    options: {
      adapter: { type: 'string', default: process.env.GENAI_ADAPTER ?? 'mock' },
      stories: { type: 'string', default: path.join(REPO_ROOT, 'genai', 'stories') },
      out: { type: 'string' },
      drafts: { type: 'string' },
      accepted: { type: 'string', default: path.join(REPO_ROOT, 'tests', 'web', 'generated') },
      results: { type: 'string' },
      json: { type: 'string' },
      only: { type: 'string' },
      'save-prompts': { type: 'boolean', default: false },
    },
  });

  const make = adapters[values.adapter!];
  if (!make) throw new Error(`Unknown adapter "${values.adapter}". Use one of: ${Object.keys(adapters).join(', ')}`);
  const adapter = make();
  const stories = await loadStories(values.stories!, values.only?.split(',').map((s) => s.trim()));
  const defaultDrafts = path.join(REPO_ROOT, 'genai', 'drafts', adapter.name);

  if (command === 'draft') {
    const outDir = path.resolve(values.out ?? defaultDrafts);
    console.log(`Drafting ${stories.length} stories with ${adapter.description}`);
    const outcomes = await draftAll(stories, adapter, outDir, values['save-prompts']);
    for (const o of outcomes) console.log(`  ${o.error ? 'FAILED' : 'ok    '} ${o.slug} (${o.ms} ms)${o.error ? `: ${o.error}` : ''}`);
    console.log(`Drafts written to ${path.relative(REPO_ROOT, outDir) || '.'}`);
    if (outcomes.every((o) => o.error)) process.exitCode = 1;
    return;
  }

  if (command === 'evaluate') {
    const draftsDir = path.resolve(values.drafts ?? defaultDrafts);
    const results = await evaluate(stories, draftsDir, path.resolve(values.accepted!), values.results);
    const markdown = toMarkdown(results, adapter.description);
    console.log(markdown);
    if (values.out) {
      await fs.mkdir(path.dirname(path.resolve(values.out)), { recursive: true });
      await fs.writeFile(values.out, markdown, 'utf8');
    }
    if (values.json) await fs.writeFile(values.json, JSON.stringify({ adapter: adapter.description, results }, null, 2), 'utf8');
    if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
    return;
  }

  throw new Error('Usage: cli.ts <draft|evaluate> [options]');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
