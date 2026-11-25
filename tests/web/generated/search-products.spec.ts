// Drafted by the genai helper (mock adapter) from genai/stories/search-products.md.
// Reviewed against genai/REVIEW_CHECKLIST.md: accepted without changes.
import { test, expect } from '../fixtures.ts';

test.use({ role: 'customer' });

test.describe('Search the catalog', () => {
  test('Searching by name narrows the list', { tag: '@regression' }, async ({ productsPage }) => {
    // Given I am logged in as a customer
    // When I open the products page
    await productsPage.goto();
    // And I search for "keyboard"
    await productsPage.filter('keyboard');
    // Then I see 1 product
    await expect(productsPage.cards).toHaveCount(1);
    // And I see the product "Mechanical Keyboard"
    await expect(productsPage.card('Mechanical Keyboard')).toBeVisible();
  });
});
