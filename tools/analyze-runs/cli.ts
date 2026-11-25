import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { analyze, loadReports } from './analyze.ts';
import { toMarkdown } from './markdown.ts';

/**
 * Usage:
 *   tsx tools/analyze-runs/cli.ts [paths...] [--slow-ms 5000] [--top 5] [--out report.md] [--json report.json] [--fail-on-flaky]
 *
 * Paths can be Playwright JSON reports or folders searched recursively for them
 * (default: reports/). In CI the folder holds this run's reports from every
 * matrix job plus the reports downloaded from earlier runs.
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'slow-ms': { type: 'string', default: '5000' },
    top: { type: 'string', default: '5' },
    'root-dir': { type: 'string' },
    out: { type: 'string' },
    json: { type: 'string' },
    'fail-on-flaky': { type: 'boolean', default: false },
  },
});

const inputs = (positionals.length ? positionals : ['reports']).filter((p) => fs.existsSync(p));
const reports = loadReports(inputs);
if (reports.length === 0) {
  console.error(`No Playwright JSON reports found in: ${positionals.join(', ') || 'reports'}`);
  process.exit(1);
}

const slowMs = Number(values['slow-ms']);
const analysis = analyze(reports, { slowMs, top: Number(values.top), rootDir: values['root-dir'] ?? process.cwd() });
const markdown = toMarkdown(analysis, { slowMs });
console.log(markdown);

const write = (file: string, content: string) => {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
};
if (values.out) write(values.out, markdown);
if (values.json) write(values.json, JSON.stringify(analysis, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
if (values['fail-on-flaky'] && analysis.flaky.length > 0) process.exitCode = 1;
