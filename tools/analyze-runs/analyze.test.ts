import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { analyze, loadReports, type JsonReport } from './analyze.ts';

const result = (status: string, duration: number, retry = 0, message?: string) => ({
  status,
  duration,
  retry,
  ...(message ? { error: { message } } : {}),
});

/** Minimal Playwright JSON report with one file and the given tests. */
function report(tests: Array<{ title: string; status: string; results: ReturnType<typeof result>[] }>): JsonReport {
  return {
    suites: [
      {
        title: 'web/demo.spec.ts',
        file: 'web/demo.spec.ts',
        specs: tests.map((t, i) => ({
          title: t.title,
          file: 'web/demo.spec.ts',
          line: 10 + i,
          tests: [{ projectName: 'chromium', status: t.status, results: t.results }],
        })),
      },
    ],
  } as JsonReport;
}

describe('analyze-runs', () => {
  it('flags a test that passed only on retry as flaky', () => {
    const run = report([
      { title: 'stable', status: 'expected', results: [result('passed', 100)] },
      { title: 'wobbly', status: 'flaky', results: [result('failed', 100, 0, 'Error: strict mode violation: resolved to 2 elements'), result('passed', 120, 1)] },
    ]);
    const a = analyze([{ name: 'run1', report: run }], { slowMs: 10_000, top: 0 });
    assert.deepEqual(a.flaky.map((f) => f.title), ['wobbly']);
    assert.equal(a.flaky[0].flaky, 1);
    assert.match(a.flaky[0].suggestions.join('\n'), /make it unique/);
  });

  it('flags a test that passes in one run and fails in another as flaky', () => {
    const pass = report([{ title: 'sometimes', status: 'expected', results: [result('passed', 100)] }]);
    const fail = report([{ title: 'sometimes', status: 'unexpected', results: [result('timedOut', 30_000, 0, 'Test timeout of 30000ms exceeded.')] }]);
    const a = analyze(
      [
        { name: 'run1', report: pass },
        { name: 'run2', report: fail },
      ],
      { slowMs: 10_000, top: 0 },
    );
    assert.equal(a.flaky.length, 1);
    assert.equal(a.flaky[0].flakeRate, 0.5);
    assert.equal(a.failing.length, 0);
  });

  it('separates consistently failing tests from flaky ones', () => {
    const run = report([{ title: 'broken', status: 'unexpected', results: [result('failed', 50, 0, 'Error: expect(received).toBe(expected)\nExpected: "1"\nReceived: "0"')] }]);
    const a = analyze([{ name: 'run1', report: run }], { slowMs: 10_000, top: 0 });
    assert.equal(a.flaky.length, 0);
    assert.deepEqual(a.failing.map((f) => f.title), ['broken']);
  });

  it('ranks slow tests by p95 and applies the threshold', () => {
    const run = report([
      { title: 'fast', status: 'expected', results: [result('passed', 200)] },
      { title: 'slow', status: 'expected', results: [result('passed', 9_000)] },
      { title: 'medium', status: 'expected', results: [result('passed', 3_000)] },
    ]);
    const a = analyze([{ name: 'run1', report: run }], { slowMs: 5_000, top: 2 });
    assert.deepEqual(a.slow.map((f) => f.title), ['slow', 'medium']);
    assert.ok(a.slow[0].suggestions.length > 0);
  });

  it('reads the committed sample reports and finds the drill test flaky with a source hint', () => {
    const fixtures = path.join(import.meta.dirname, 'fixtures');
    const reports = loadReports([fixtures]);
    assert.equal(reports.length, 2);
    const a = analyze(reports, { slowMs: 5_000, top: 3, rootDir: path.resolve(import.meta.dirname, '..', '..', 'tests') });
    const drill = a.flaky.find((f) => f.title.includes('BROKEN'));
    assert.ok(drill, 'drill test should be reported as flaky');
    assert.match(drill.suggestions.join('\n'), /web-first assertion/);
    assert.equal(a.slow.length, 3);
  });
});
