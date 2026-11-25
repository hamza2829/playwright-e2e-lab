import { FIXTURES_PLACEHOLDER } from '../prompt.ts';
import type { Scenario, Step, Story } from '../story.ts';
import type { DraftAdapter, DraftRequest } from './types.ts';

/**
 * Deterministic mock "model".
 *
 * It maps known step phrases to page-object calls with a small rule table and
 * ignores the prompt. Unknown phrases become TODO comments, which is exactly
 * what the review checklist is meant to catch. Being deterministic, it lets CI
 * exercise the whole draft -> review -> evaluate pipeline with no model, no
 * network and no secrets, and its measured numbers are reproducible.
 */

type Role = 'guest' | 'customer' | 'admin';

interface Rendered {
  code?: string[];
  fixtures?: string[];
  imports?: string[];
  role?: Role;
}

interface Rule {
  pattern: RegExp;
  render: (m: RegExpExecArray) => Rendered;
}

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export const RULES: Rule[] = [
  // --- login state -------------------------------------------------------
  { pattern: /^I am logged in as an? (customer|admin)$/i, render: (m) => ({ role: m[1].toLowerCase() as Role }) },
  { pattern: /^I am not logged in$|^I am a guest$/i, render: () => ({ role: 'guest' }) },
  {
    pattern: /^I sign in as "(.+)" with password "(.+)"$/i,
    render: (m) => ({ code: ['await loginPage.goto();', `await loginPage.login(${q(m[1])}, ${q(m[2])});`], fixtures: ['loginPage'] }),
  },
  // --- navigation -------------------------------------------------------
  { pattern: /^I open the products page$/i, render: () => ({ code: ['await productsPage.goto();'], fixtures: ['productsPage'] }) },
  { pattern: /^I open the cart$/i, render: () => ({ code: ['await shell.openCart();'], fixtures: ['shell'] }) },
  { pattern: /^I open the admin page$/i, render: () => ({ code: ['await adminPage.goto();'], fixtures: ['adminPage'] }) },
  { pattern: /^I proceed to checkout$/i, render: () => ({ code: ['await cartPage.proceedToCheckout();'], fixtures: ['cartPage'] }) },
  // --- actions ----------------------------------------------------------
  {
    pattern: /^I add "(.+)" to the cart$/i,
    render: (m) => ({ code: [`await productsPage.addToCart(${q(m[1])});`], fixtures: ['productsPage'] }),
  },
  {
    pattern: /^I remove "(.+)" from the cart$/i,
    render: (m) => ({ code: [`await cartPage.remove(${q(m[1])});`], fixtures: ['cartPage'] }),
  },
  {
    pattern: /^I set the quantity of "(.+)" to (\d+)$/i,
    render: (m) => ({ code: [`await cartPage.setQuantity(${q(m[1])}, ${m[2]});`], fixtures: ['cartPage'] }),
  },
  { pattern: /^I search for "(.+)"$/i, render: (m) => ({ code: [`await productsPage.filter(${q(m[1])});`], fixtures: ['productsPage'] }) },
  {
    pattern: /^I place the order with valid shipping details$/i,
    render: () => ({ code: ['await checkoutPage.submit(VALID_SHIPPING);'], fixtures: ['checkoutPage'], imports: ['VALID_SHIPPING'] }),
  },
  // --- assertions -------------------------------------------------------
  { pattern: /^the cart badge shows (\d+)$/i, render: (m) => ({ code: [`await shell.expectCartCount(${m[1]});`], fixtures: ['shell'] }) },
  {
    pattern: /^the cart total is "(.+)"$/i,
    render: (m) => ({ code: [`await expect(cartPage.total).toHaveText(${q(m[1])});`], fixtures: ['cartPage'], imports: ['expect'] }),
  },
  {
    pattern: /^the shipping is "(.+)"$/i,
    render: (m) => ({ code: [`await expect(cartPage.shipping).toHaveText(${q(m[1])});`], fixtures: ['cartPage'], imports: ['expect'] }),
  },
  {
    pattern: /^I see the empty cart message$/i,
    render: () => ({ code: ['await expect(cartPage.emptyMessage).toBeVisible();'], fixtures: ['cartPage'], imports: ['expect'] }),
  },
  {
    pattern: /^I see an order confirmation$/i,
    render: () => ({ code: ['await confirmationPage.expectConfirmed();'], fixtures: ['confirmationPage'] }),
  },
  {
    pattern: /^I see (\d+) products?$/i,
    render: (m) => ({ code: [`await expect(productsPage.cards).toHaveCount(${m[1]});`], fixtures: ['productsPage'], imports: ['expect'] }),
  },
  {
    pattern: /^I see the product "(.+)"$/i,
    render: (m) => ({ code: [`await expect(productsPage.card(${q(m[1])})).toBeVisible();`], fixtures: ['productsPage'], imports: ['expect'] }),
  },
  {
    // Deliberately generic, like a model that does not know the page objects well.
    pattern: /^I see the error "(.+)"$/i,
    render: (m) => ({ code: [`await expect(page.getByText(${q(m[1])})).toBeVisible();`], fixtures: ['page'], imports: ['expect'] }),
  },
];

export function renderStep(step: Step): Rendered | null {
  for (const rule of RULES) {
    const m = rule.pattern.exec(step.text);
    if (m) return rule.render(m);
  }
  return null;
}

export function renderStory(story: Story): string {
  const imports = new Set<string>(['test']);
  const ctx: { role: Role } = { role: 'guest' };
  const tests: string[] = [];

  for (const scenario of story.scenarios) {
    tests.push(renderScenario(story, scenario, imports, (r) => (ctx.role = r)));
  }

  const ordered = ['test', 'expect', 'VALID_SHIPPING', 'uniqueName'].filter((name) => imports.has(name));
  const out = [`import { ${ordered.join(', ')} } from '${FIXTURES_PLACEHOLDER}';`, ''];
  if (ctx.role !== 'guest') out.push(`test.use({ role: '${ctx.role}' });`, '');
  out.push(`test.describe(${q(story.title)}, () => {`, tests.join('\n\n'), '});');
  return out.join('\n');
}

function renderScenario(story: Story, scenario: Scenario, imports: Set<string>, setRole: (r: Role) => void): string {
  const fixtures = new Set<string>();
  const body: string[] = [];
  for (const step of scenario.steps) {
    body.push(`// ${step.written} ${step.text}`);
    const rendered = renderStep(step);
    if (!rendered) {
      body.push(`// TODO(genai): no mapping for this step; implement it by hand.`);
      continue;
    }
    if (rendered.role) setRole(rendered.role);
    rendered.fixtures?.forEach((f) => fixtures.add(f));
    rendered.imports?.forEach((i) => imports.add(i));
    body.push(...(rendered.code ?? []));
  }
  const tag = story.tags.length === 1 ? q(story.tags[0]) : `[${story.tags.map(q).join(', ')}]`;
  const params = fixtures.size ? `{ ${[...fixtures].join(', ')} }` : '{}';
  return [
    `  test(${q(scenario.name)}, { tag: ${tag} }, async (${params}) => {`,
    ...body.map((l) => `    ${l}`),
    '  });',
  ].join('\n');
}

export class MockAdapter implements DraftAdapter {
  readonly name = 'mock';
  readonly description = 'Deterministic rule-based mock (step phrase -> page-object call). No model, no network.';

  async generate({ story }: DraftRequest): Promise<string> {
    return ['Here is the test file:', '', '```ts', renderStory(story), '```', ''].join('\n');
  }
}
