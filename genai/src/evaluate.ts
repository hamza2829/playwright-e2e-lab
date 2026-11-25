import fs from 'node:fs/promises';
import path from 'node:path';
import { review, type CheckResult } from './review.ts';
import type { Story } from './story.ts';

/**
 * Measures how far each draft is from the human-reviewed test that was
 * finally committed (tests/web/generated/<slug>.spec.ts), plus the automated
 * checklist and, optionally, whether the raw draft passed when executed.
 */

export interface Evaluation {
  slug: string;
  title: string;
  checks: CheckResult[];
  execution: 'passed' | 'failed' | 'error' | 'not run';
  linesChanged: number;
  draftLines: number;
  needsChanges: boolean;
}

/** Comments, blank lines and the fixtures import path do not count as edits. */
export function normalise(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('//'))
    .map((l) => l.replace(/from\s+['"][^'"]*fixtures(\.ts)?['"]/, "from '<fixtures>'"));
}

/** Lines added + lines removed to turn `a` into `b` (LCS based). */
export function lineDiff(a: string[], b: string[]): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const common = dp[0][0];
  return a.length - common + (b.length - common);
}

type JsonSuite = { file?: string; specs?: Array<{ file: string; tests: Array<{ status: string }> }>; suites?: JsonSuite[] };
type JsonReport = { suites?: JsonSuite[]; errors?: Array<{ message?: string; location?: { file: string } }> };

export function executionStatus(report: JsonReport | null, slug: string): Evaluation['execution'] {
  if (!report) return 'not run';
  const matches = (file: string | undefined) => !!file && file.replace(/\\/g, '/').endsWith(`/${slug}.spec.ts`);
  if ((report.errors ?? []).some((e) => matches(e.location?.file) || (e.message ?? '').includes(`${slug}.spec.ts`))) return 'error';
  const statuses: string[] = [];
  const walk = (suite: JsonSuite) => {
    for (const spec of suite.specs ?? []) if (matches(spec.file) || matches(suite.file)) statuses.push(...spec.tests.map((t) => t.status));
    suite.suites?.forEach(walk);
  };
  report.suites?.forEach(walk);
  if (statuses.length === 0) return 'not run';
  return statuses.every((s) => s === 'expected' || s === 'flaky') ? 'passed' : 'failed';
}

export async function evaluate(stories: Story[], draftsDir: string, acceptedDir: string, resultsFile?: string): Promise<Evaluation[]> {
  const report: JsonReport | null = resultsFile ? JSON.parse(await fs.readFile(resultsFile, 'utf8').catch(() => 'null')) : null;
  const results: Evaluation[] = [];
  for (const story of stories) {
    const draft = await fs.readFile(path.join(draftsDir, `${story.slug}.spec.ts`), 'utf8').catch(() => '');
    const accepted = await fs.readFile(path.join(acceptedDir, `${story.slug}.spec.ts`), 'utf8').catch(() => '');
    const a = normalise(draft);
    const changed = lineDiff(a, normalise(accepted));
    results.push({
      slug: story.slug,
      title: story.title,
      checks: review(draft, story),
      execution: executionStatus(report, story.slug),
      linesChanged: changed,
      draftLines: a.length,
      needsChanges: changed > 0,
    });
  }
  return results;
}

export function toMarkdown(results: Evaluation[], adapterDescription: string): string {
  const n = results.length;
  const changed = results.filter((r) => r.needsChanges).length;
  const checklistClean = results.filter((r) => r.checks.every((c) => c.passed)).length;
  const executed = results.filter((r) => r.execution !== 'not run');
  const passed = executed.filter((r) => r.execution === 'passed').length;
  const totalChanged = results.reduce((s, r) => s + r.linesChanged, 0);
  const totalLines = results.reduce((s, r) => s + r.draftLines, 0);
  const pct = (x: number, of: number) => (of === 0 ? 'n/a' : `${Math.round((100 * x) / of)}%`);

  const lines = [
    `### GenAI draft evaluation: ${adapterDescription}`,
    '',
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Stories drafted | ${n} |`,
    `| Drafts accepted unchanged | ${n - changed} (${pct(n - changed, n)}) |`,
    `| **Drafts that needed changes** | **${changed} (${pct(changed, n)})** |`,
    `| Lines changed during review (added + removed) | ${totalChanged} across ${totalLines} draft lines (${pct(totalChanged, totalLines)}) |`,
    `| Drafts passing the automated checklist | ${checklistClean} (${pct(checklistClean, n)}) |`,
    `| Raw drafts passing when executed | ${executed.length ? `${passed}/${executed.length} (${pct(passed, executed.length)})` : 'not run'} |`,
    '',
    '| Story | Executed as drafted | Checklist failures | Lines changed | Needed changes |',
    '| --- | --- | --- | ---: | --- |',
    ...results.map((r) => {
      const failures = r.checks.filter((c) => !c.passed).map((c) => `${c.id}${c.detail ? ` (${c.detail})` : ''}`);
      return `| ${r.slug} | ${r.execution} | ${failures.join(', ') || 'none'} | ${r.linesChanged} | ${r.needsChanges ? 'yes' : 'no'} |`;
    }),
    '',
    'Checklist ids: ' + (results[0]?.checks.map((c) => `${c.id} = ${c.title}`).join('; ') ?? ''),
    '',
  ];
  return lines.join('\n');
}
