import fs from 'node:fs';
import path from 'node:path';

/**
 * Reads Playwright JSON reporter output from one or more runs and finds
 * flaky, consistently failing and slow tests, with a suggested fix for each.
 */

// ---- Playwright JSON reporter shapes (only the fields we use) -------------
interface JsonResult {
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  duration: number;
  retry: number;
  error?: { message?: string };
  errors?: Array<{ message?: string }>;
}
interface JsonTest {
  projectName: string;
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  results: JsonResult[];
}
interface JsonSpec {
  title: string;
  file: string;
  line: number;
  tests: JsonTest[];
}
interface JsonSuite {
  title: string;
  file?: string;
  specs?: JsonSpec[];
  suites?: JsonSuite[];
}
export interface JsonReport {
  config?: { rootDir?: string };
  suites?: JsonSuite[];
  stats?: { startTime?: string; duration?: number };
}

// ---- aggregated model -----------------------------------------------------
export interface RunOutcome {
  run: string;
  status: JsonTest['status'];
  attempts: number;
  /** Duration of the final attempt (ms). */
  duration: number;
  errors: string[];
}

export interface TestHistory {
  id: string;
  project: string;
  file: string;
  line: number;
  title: string;
  outcomes: RunOutcome[];
}

export interface Finding {
  id: string;
  project: string;
  title: string;
  location: string;
  runs: number;
  passed: number;
  flaky: number;
  failed: number;
  flakeRate: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  topError?: string;
  suggestions: string[];
}

export interface Analysis {
  runs: string[];
  testsSeen: number;
  flaky: Finding[];
  failing: Finding[];
  slow: Finding[];
}

export interface Options {
  /** A test is slow if its p95 final-attempt duration is at least this many ms. */
  slowMs: number;
  /** Always list at least this many of the slowest tests. */
  top: number;
  /** Folder the report's file paths are relative to, for reading test source. */
  rootDir?: string;
}

const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');

export function loadReports(paths: string[]): Array<{ name: string; report: JsonReport }> {
  const files: string[] = [];
  const walk = (p: string) => {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) fs.readdirSync(p).sort().forEach((f) => walk(path.join(p, f)));
    else if (p.endsWith('.json')) files.push(p);
  };
  paths.forEach(walk);
  const reports: Array<{ name: string; report: JsonReport }> = [];
  for (const file of files) {
    try {
      const report = JSON.parse(fs.readFileSync(file, 'utf8')) as JsonReport;
      if (Array.isArray(report.suites)) reports.push({ name: file.split(path.sep).join('/'), report });
    } catch {
      /* not a Playwright JSON report */
    }
  }
  return reports;
}

export function collect(reports: Array<{ name: string; report: JsonReport }>): Map<string, TestHistory> {
  const tests = new Map<string, TestHistory>();
  for (const { name, report } of reports) {
    const visit = (suite: JsonSuite, titles: string[], depth: number) => {
      // Top-level suites are files; their title is the file path, which is reported separately.
      const here = depth === 0 ? titles : [...titles, suite.title].filter(Boolean);
      for (const spec of suite.specs ?? []) {
        const file = spec.file.split(path.sep).join('/');
        for (const t of spec.tests) {
          if (t.status === 'skipped') continue;
          const title = [...here, spec.title].join(' › ');
          const id = `${t.projectName} › ${file} › ${title}`;
          const history = tests.get(id) ?? { id, project: t.projectName, file, line: spec.line, title, outcomes: [] };
          const last = t.results[t.results.length - 1];
          history.outcomes.push({
            run: name,
            status: t.status,
            attempts: t.results.length,
            duration: last?.duration ?? 0,
            errors: t.results.flatMap((r) => [r.error?.message, ...(r.errors ?? []).map((e) => e.message)]).filter((m): m is string => !!m).map(stripAnsi),
          });
          tests.set(id, history);
        }
      }
      for (const child of suite.suites ?? []) visit(child, here, depth + 1);
    };
    for (const suite of report.suites ?? []) visit(suite, [], 0);
  }
  return tests;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

// ---- fix suggestions --------------------------------------------------------
const ERROR_RULES: Array<{ pattern: RegExp; advice: string }> = [
  {
    pattern: /strict mode violation/i,
    advice: 'Locator matched several elements: make it unique (getByRole with a name, .filter(), or unique test data per test).',
  },
  {
    pattern: /ECONNREFUSED|ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE/i,
    advice: 'App was not reachable: make the webServer wait on a health URL and check the server log for crashes.',
  },
  {
    pattern: /has been closed|Target closed/i,
    advice: 'Page or app closed mid-test: look for a missing await, or a fixture tearing down while the test still runs.',
  },
  {
    pattern: /Test timeout of \d+ms exceeded/i,
    advice: 'The whole test hit its timeout: find the slow step in the trace; arrange data through the API rather than the UI.',
  },
  {
    pattern: /Timeout \d+ms exceeded|waiting for (locator|getBy)/i,
    advice: 'An action or assertion timed out waiting for an element: check the locator in the trace, and wait for the response or state that makes it appear.',
  },
  {
    pattern: /Expected:[\s\S]*Received:/,
    advice: 'Value differed from the expectation: if it is right a moment later, the assertion is not retrying (see source hints).',
  },
];

const SOURCE_RULES: Array<{ pattern: RegExp; advice: string }> = [
  {
    // Either expect(await locator.textContent()) or const x = await locator.textContent(); expect(x)...
    pattern: /(expect\(\s*|=\s*)await [^;]*\.(textContent|innerText|inputValue|isVisible|isChecked|count|getAttribute)\(/,
    advice: 'Asserts on a value read once from the page, so the check never retries: use a web-first assertion such as await expect(locator).toHaveText(...).',
  },
  { pattern: /waitForTimeout\(/, advice: 'Fixed sleep (waitForTimeout): replace it with a web-first assertion or waitForResponse.' },
  { pattern: /networkidle/, advice: "'networkidle' is unreliable with polling or analytics: wait for a specific element or response instead." },
  { pattern: /force:\s*true/, advice: 'force: true skips actionability checks and can hide a real overlay or disabled-state bug.' },
  { pattern: /page\.\$\$?\(/, advice: 'ElementHandle API (page.$): switch to locators, which re-resolve and auto-wait.' },
];

/** Returns the source of the test starting at `line`, up to the next test or 80 lines. */
export function testSource(rootDir: string | undefined, file: string, line: number): string | null {
  const candidates = [rootDir ? path.join(rootDir, file) : null, file, path.join('tests', file)].filter((p): p is string => !!p);
  for (const candidate of candidates) {
    try {
      const lines = fs.readFileSync(candidate, 'utf8').split(/\r?\n/);
      const body: string[] = [];
      for (let i = line - 1; i < Math.min(lines.length, line + 79); i++) {
        // Stop at the next test declaration (a title string), not at test.skip(condition) inside this one.
        if (i > line - 1 && /^\s*test(\.\w+)?\(\s*['"`]/.test(lines[i])) break;
        body.push(lines[i]);
      }
      return body.join('\n');
    } catch {
      /* try next */
    }
  }
  return null;
}

export function suggest(kind: 'flaky' | 'failing' | 'slow', history: TestHistory, source: string | null, slowMs: number): string[] {
  const out = new Set<string>();
  const errors = history.outcomes.flatMap((o) => o.errors).join('\n');
  for (const rule of ERROR_RULES) if (rule.pattern.test(errors)) out.add(rule.advice);
  if (source) for (const rule of SOURCE_RULES) if (rule.pattern.test(source)) out.add(rule.advice);
  if (kind === 'flaky' && out.size === 0) {
    out.add('Passes on retry with no clear signal: open the failed attempt trace and compare its network timing with a passing one.');
  }
  if (kind === 'slow') {
    const gotos = source ? (source.match(/\.goto\(/g) ?? []).length : 0;
    const uiLogin = source ? /login\(|Sign in/.test(source) : false;
    if (uiLogin) out.add('Logs in through the UI: use the role fixture (test.use({ role })) to inject the session instead.');
    if (gotos > 2) out.add(`Navigates ${gotos} times: split it into focused tests or arrange state through the API.`);
    const retried = history.outcomes.some((o) => o.attempts > 1);
    if (retried) out.add('Part of its time is retries: fix the flakiness first.');
    out.add(`Look at the slowest step in the trace; arrange data with tests/web/support/shop-api.ts so the UI part covers only what is under test (threshold ${slowMs} ms).`);
  }
  return [...out];
}

export function analyze(reports: Array<{ name: string; report: JsonReport }>, options: Options): Analysis {
  const histories = collect(reports);
  const rootDir = options.rootDir ?? reports.find((r) => r.report.config?.rootDir)?.report.config?.rootDir;

  const toFinding = (h: TestHistory, kind: 'flaky' | 'failing' | 'slow'): Finding => {
    const durations = h.outcomes.map((o) => o.duration);
    const passed = h.outcomes.filter((o) => o.status === 'expected').length;
    const flaky = h.outcomes.filter((o) => o.status === 'flaky').length;
    const failed = h.outcomes.filter((o) => o.status === 'unexpected').length;
    const errors = h.outcomes.flatMap((o) => o.errors);
    return {
      id: h.id,
      project: h.project,
      title: h.title,
      location: `${h.file}:${h.line}`,
      runs: h.outcomes.length,
      passed,
      flaky,
      failed,
      flakeRate: h.outcomes.length ? (flaky + failed) / h.outcomes.length : 0,
      medianMs: percentile(durations, 50),
      p95Ms: percentile(durations, 95),
      maxMs: Math.max(0, ...durations),
      topError: errors[0]?.split('\n')[0]?.slice(0, 160),
      suggestions: suggest(kind, h, testSource(rootDir, h.file, h.line), options.slowMs),
    };
  };

  const all = [...histories.values()];
  // Flaky: passed only after a retry in some run, or passed in some runs and failed in others.
  const flaky = all
    .filter((h) => h.outcomes.some((o) => o.status === 'flaky') || (h.outcomes.some((o) => o.status === 'expected') && h.outcomes.some((o) => o.status === 'unexpected')))
    .map((h) => toFinding(h, 'flaky'))
    .sort((a, b) => b.flakeRate - a.flakeRate || b.runs - a.runs);
  // Failing: failed in every run it appeared in.
  const failing = all
    .filter((h) => h.outcomes.every((o) => o.status === 'unexpected'))
    .map((h) => toFinding(h, 'failing'));
  // Slow: p95 over the threshold, plus the top N slowest overall.
  const byP95 = all.map((h) => ({ h, p95: percentile(h.outcomes.map((o) => o.duration), 95) })).sort((a, b) => b.p95 - a.p95);
  const slowSet = new Set([...byP95.filter((x) => x.p95 >= options.slowMs), ...byP95.slice(0, options.top)].map((x) => x.h));
  const slow = [...slowSet].map((h) => toFinding(h, 'slow')).sort((a, b) => b.p95Ms - a.p95Ms);

  return { runs: reports.map((r) => r.name), testsSeen: all.length, flaky, failing, slow };
}
