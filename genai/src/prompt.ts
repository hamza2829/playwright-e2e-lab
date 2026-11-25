import type { Story } from './story.ts';

/** Placeholder the model writes for the fixtures import; draft.ts swaps in the real relative path. */
export const FIXTURES_PLACEHOLDER = '@fixtures';

/**
 * The context a model needs to write a test that fits this repo: the fixture
 * and page-object API, the house rules, and one worked example.
 * Kept short on purpose: small local models lose the thread on long prompts.
 */
export const API_REFERENCE = `
Fixtures (destructure them in the test function):
  page, shell, loginPage, productsPage, cartPage, checkoutPage, confirmationPage, adminPage,
  api, session, createProduct
Login state: put test.use({ role: 'customer' }) or test.use({ role: 'admin' }) at the top of the file.
  role 'guest' (default) means not logged in.

shell:            expectCartCount(n), openCart(), logout(), cartCount, toast
loginPage:        goto(), login(username, password), error, expectVisible()
productsPage:     goto(), addToCart(name), filter(query), card(name), addButton(name), cards, noResults
cartPage:         goto(), setQuantity(name, qty), remove(name), proceedToCheckout(),
                  lines, subtotal, shipping, total, emptyMessage
checkoutPage:     goto(), submit(details = VALID_SHIPPING), fieldError(field), error, total
confirmationPage: expectConfirmed() -> order id, total
adminPage:        goto(), createProduct({ name, price, stock }), inventoryRow(name), accessDenied
createProduct({ name?, priceCents?, stock? }) -> product (deleted automatically after the test)
`.trim();

export const HOUSE_RULES = `
- Import only from '${FIXTURES_PLACEHOLDER}': import { test, expect, VALID_SHIPPING, uniqueName } from '${FIXTURES_PLACEHOLDER}';
- One test per scenario, inside test.describe('<feature title>').
- Add tags with the details object: test('name', { tag: ['@regression'] }, async ({ ... }) => { ... }).
- Use page objects and web-first assertions (await expect(locator).toHaveText(...)). Never use waitForTimeout.
- Every Then step must become at least one expect().
- Output only TypeScript code in a single \`\`\`ts block.
`.trim();

const EXAMPLE = `
\`\`\`ts
import { test, expect } from '${FIXTURES_PLACEHOLDER}';

test.use({ role: 'customer' });

test.describe('Cart badge', () => {
  test('adding a product updates the badge', { tag: ['@regression'] }, async ({ productsPage, shell }) => {
    await productsPage.goto();
    await productsPage.addToCart('Wireless Mouse');
    await shell.expectCartCount(1);
  });
});
\`\`\`
`.trim();

export function buildPrompt(story: Story): string {
  const scenarios = story.scenarios
    .map((s) => [`Scenario: ${s.name}`, ...s.steps.map((st) => `  ${st.written} ${st.text}`)].join('\n'))
    .join('\n\n');
  return [
    'You write Playwright Test code in TypeScript for a demo web shop.',
    '',
    'API you can use:',
    API_REFERENCE,
    '',
    'Rules:',
    HOUSE_RULES,
    '',
    'Example:',
    EXAMPLE,
    '',
    `Feature: ${story.title}`,
    `Tags: ${story.tags.join(' ')}`,
    story.narrative,
    '',
    scenarios,
    '',
    'Write the test file now.',
  ].join('\n');
}
