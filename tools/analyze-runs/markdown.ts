import type { Analysis, Finding } from './analyze.ts';

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function details(f: Finding): string {
  return [`- **${cell(f.title)}** (${f.project}, \`${f.location}\`)`, ...f.suggestions.map((s) => `  - ${s}`)].join('\n');
}

export function toMarkdown(a: Analysis, options: { slowMs: number }): string {
  const out: string[] = [];
  out.push('## Test health report', '');
  out.push(`Analyzed **${a.runs.length}** run report(s) covering **${a.testsSeen}** test/project combinations.`, '');

  out.push(`### Flaky tests (${a.flaky.length})`, '');
  if (a.flaky.length === 0) out.push('No flaky tests found. A test counts as flaky when it passed only on retry, or passed in some runs and failed in others.', '');
  else {
    out.push('| Test | Project | Runs | Passed | Flaky | Failed | Flake rate | First error |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const f of a.flaky) {
      out.push(`| ${cell(f.title)} | ${f.project} | ${f.runs} | ${f.passed} | ${f.flaky} | ${f.failed} | ${Math.round(f.flakeRate * 100)}% | ${cell(f.topError ?? '')} |`);
    }
    out.push('', '**Suggested fixes**', '', ...a.flaky.map(details), '');
  }

  out.push(`### Consistently failing (${a.failing.length})`, '');
  if (a.failing.length === 0) out.push('None.', '');
  else {
    out.push('| Test | Project | Runs | First error |', '| --- | --- | ---: | --- |');
    for (const f of a.failing) out.push(`| ${cell(f.title)} | ${f.project} | ${f.runs} | ${cell(f.topError ?? '')} |`);
    out.push('', '**Suggested fixes**', '', ...a.failing.map(details), '');
  }

  out.push(`### Slowest tests (p95 at least ${secs(options.slowMs)}, or among the slowest)`, '');
  if (a.slow.length === 0) out.push('No test results found.', '');
  else {
    out.push('| Test | Project | Runs | Median | p95 | Max |', '| --- | --- | ---: | ---: | ---: | ---: |');
    for (const f of a.slow) out.push(`| ${cell(f.title)} | ${f.project} | ${f.runs} | ${secs(f.medianMs)} | ${secs(f.p95Ms)} | ${secs(f.maxMs)} |`);
    const overThreshold = a.slow.filter((f) => f.p95Ms >= options.slowMs);
    if (overThreshold.length) out.push('', '**Suggested fixes**', '', ...overThreshold.map(details));
    out.push('');
  }

  out.push('<details><summary>Reports analyzed</summary>', '', ...a.runs.map((r) => `- \`${r}\``), '', '</details>', '');
  return out.join('\n');
}
