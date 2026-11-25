import type { Story } from './story.ts';

/**
 * Automated part of genai/REVIEW_CHECKLIST.md. These checks are cheap
 * heuristics over the source text; the checklist also has items only a human
 * can judge (is the scenario meaningful, are the right things asserted).
 */

export interface CheckResult {
  id: string;
  title: string;
  passed: boolean;
  detail?: string;
}

interface Check {
  id: string;
  title: string;
  run(source: string, story: Story): { passed: boolean; detail?: string };
}

const count = (source: string, re: RegExp) => (source.match(re) ?? []).length;
const code = (source: string) =>
  source
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

export const CHECKS: Check[] = [
  {
    id: 'R1',
    title: 'Imports test/expect from the shared fixtures, not @playwright/test',
    run: (s) => {
      const fromFixtures = /from\s+['"][^'"]*fixtures(\.ts)?['"]/.test(s);
      const direct = /from\s+['"]@playwright\/test['"]/.test(s);
      return { passed: fromFixtures && !direct, detail: direct ? 'imports @playwright/test directly' : fromFixtures ? undefined : 'no fixtures import' };
    },
  },
  {
    id: 'R2',
    title: 'Every test is tagged @smoke or @regression',
    run: (s) => {
      const tests = count(code(s), /^\s*test\(\s*['"`]/gm);
      const tagged = count(code(s), /^\s*test\(\s*['"`][^\n]*tag:\s*\[?\s*['"]@(smoke|regression)/gm);
      return { passed: tests > 0 && tests === tagged, detail: `${tagged}/${tests} tests tagged` };
    },
  },
  {
    id: 'R3',
    title: 'One test per scenario',
    run: (s, story) => {
      const tests = count(code(s), /^\s*test\(\s*['"`]/gm);
      return { passed: tests === story.scenarios.length, detail: `${tests} tests for ${story.scenarios.length} scenarios` };
    },
  },
  {
    id: 'R4',
    title: 'No TODO markers or unimplemented steps',
    run: (s) => {
      const todos = count(s, /TODO|FIXME|test\.fixme|not implemented/gi);
      return { passed: todos === 0, detail: todos ? `${todos} marker(s)` : undefined };
    },
  },
  {
    id: 'R5',
    title: 'Every Then step has an assertion',
    run: (s, story) => {
      const thens = story.scenarios.reduce((n, sc) => n + sc.steps.filter((st) => st.keyword === 'Then').length, 0);
      // expect(...) plus page-object assertion helpers (expectCartCount, expectConfirmed, ...).
      const assertions = count(code(s), /\bexpect\s*\(|\.expect[A-Z]\w*\s*\(/g);
      return { passed: assertions >= thens, detail: `${assertions} assertion(s) for ${thens} Then step(s)` };
    },
  },
  {
    id: 'R6',
    title: 'No fixed sleeps (waitForTimeout / setTimeout)',
    run: (s) => {
      const sleeps = count(code(s), /waitForTimeout|setTimeout\s*\(/g);
      return { passed: sleeps === 0, detail: sleeps ? `${sleeps} sleep(s)` : undefined };
    },
  },
  {
    id: 'R7',
    title: 'Uses page objects instead of raw page locators',
    run: (s) => {
      const raw = count(code(s), /\bpage\.(locator|\$\$?|getBy\w+)\s*\(/g);
      return { passed: raw === 0, detail: raw ? `${raw} raw locator(s)` : undefined };
    },
  },
  {
    id: 'R8',
    title: 'Test data is unique per run (no fixed names for created data)',
    run: (s) => {
      const fixed = count(code(s), /createProduct\(\s*\{[^}]*name:\s*['"`]/g);
      return { passed: fixed === 0, detail: fixed ? 'createProduct with a hard-coded name' : undefined };
    },
  },
];

export function review(source: string, story: Story): CheckResult[] {
  return CHECKS.map((c) => ({ id: c.id, title: c.title, ...c.run(source, story) }));
}
