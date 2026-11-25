import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { MockAdapter, renderStory } from './adapters/mock.ts';
import { extractCode, fixImports } from './draft.ts';
import { lineDiff, normalise } from './evaluate.ts';
import { buildPrompt } from './prompt.ts';
import { review } from './review.ts';
import { parseStory } from './story.ts';

const STORY = `# Cart badge
Tags: @smoke
As a customer I want to see my cart size.

## Scenario: Badge counts items
Given I am logged in as a customer
When I open the products page
And I add "Wireless Mouse" to the cart
Then the cart badge shows 1
And the badge glows green
`;

describe('genai helper', () => {
  const story = parseStory(STORY, 'cart-badge');

  it('parses stories, resolving And to the previous keyword', () => {
    assert.equal(story.title, 'Cart badge');
    assert.deepEqual(story.tags, ['@smoke']);
    assert.deepEqual(story.scenarios[0].steps.map((s) => s.keyword), ['Given', 'When', 'When', 'Then', 'Then']);
  });

  it('mock adapter is deterministic and marks unknown steps as TODO', async () => {
    const a = await new MockAdapter().generate({ story, prompt: buildPrompt(story) });
    const b = await new MockAdapter().generate({ story, prompt: 'different prompt' });
    assert.equal(a, b);
    const code = extractCode(a);
    assert.match(code, /test\.use\(\{ role: 'customer' \}\)/);
    assert.match(code, /await productsPage\.addToCart\('Wireless Mouse'\);/);
    assert.match(code, /TODO\(genai\)/);
  });

  it('review flags the TODO and the missing assertion', () => {
    const results = review(renderStory(story), story);
    const failed = results.filter((r) => !r.passed).map((r) => r.id);
    assert.deepEqual(failed, ['R4', 'R5']);
  });

  it('rewrites the fixtures import relative to the output folder', () => {
    const out = path.join(import.meta.dirname, '..', 'drafts', 'x');
    assert.match(fixImports("import { test } from '@fixtures';", out), /from '\.\.\/\.\.\/\.\.\/tests\/web\/fixtures\.ts'/);
    assert.match(fixImports("import { test } from './fixtures';", out), /tests\/web\/fixtures\.ts/);
  });

  it('line diff ignores comments, blank lines and the import path', () => {
    const draft = "// header\nimport { test } from '../../../tests/web/fixtures.ts';\n\nawait a();\n// TODO\n";
    const accepted = "// reviewed\nimport { test } from '../fixtures.ts';\nawait a();\nawait b();\n";
    assert.equal(lineDiff(normalise(draft), normalise(accepted)), 1);
  });
});
