import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * User story format (Markdown, see genai/stories/):
 *
 *   # <feature title>
 *   Tags: @smoke @regression
 *   As a ... I want ... So that ...
 *   ## Scenario: <name>
 *   Given ... / When ... / Then ... / And ...
 */

export type Keyword = 'Given' | 'When' | 'Then';

export interface Step {
  keyword: Keyword;
  /** The keyword as written ("And" keeps the previous keyword's meaning). */
  written: string;
  text: string;
}

export interface Scenario {
  name: string;
  steps: Step[];
}

export interface Story {
  slug: string;
  file: string;
  title: string;
  tags: string[];
  narrative: string;
  scenarios: Scenario[];
}

export function parseStory(markdown: string, slug: string, file = `${slug}.md`): Story {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let title = slug;
  let tags: string[] = [];
  const narrative: string[] = [];
  const scenarios: Scenario[] = [];
  let current: Scenario | null = null;
  let lastKeyword: Keyword = 'Given';

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let m: RegExpExecArray | null;
    if ((m = /^#\s+(.+)$/.exec(line))) {
      title = m[1].trim();
    } else if ((m = /^tags:\s*(.+)$/i.exec(line))) {
      tags = m[1].split(/\s+/).filter((t) => t.startsWith('@'));
    } else if ((m = /^##\s*scenario:\s*(.+)$/i.exec(line))) {
      current = { name: m[1].trim(), steps: [] };
      scenarios.push(current);
    } else if (current && (m = /^(Given|When|Then|And|But)\s+(.+)$/.exec(line))) {
      const written = m[1];
      const keyword: Keyword = written === 'And' || written === 'But' ? lastKeyword : (written as Keyword);
      lastKeyword = keyword;
      current.steps.push({ keyword, written, text: m[2].trim() });
    } else if (!current) {
      narrative.push(line);
    }
  }
  if (scenarios.length === 0) throw new Error(`${file}: no "## Scenario:" section found`);
  return { slug, file, title, tags: tags.length ? tags : ['@regression'], narrative: narrative.join('\n'), scenarios };
}

export async function loadStories(dir: string, only?: string[]): Promise<Story[]> {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md')).sort();
  const stories: Story[] = [];
  for (const file of files) {
    const slug = path.basename(file, '.md');
    if (only && only.length > 0 && !only.includes(slug)) continue;
    stories.push(parseStory(await fs.readFile(path.join(dir, file), 'utf8'), slug, file));
  }
  return stories;
}
