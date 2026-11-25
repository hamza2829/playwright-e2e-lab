// Drafted by the genai helper (mock adapter) from genai/stories/free-shipping.md.
// Reviewed against genai/REVIEW_CHECKLIST.md: accepted without changes.
import { test, expect } from '../fixtures.ts';

test.use({ role: 'customer' });

test.describe('Free shipping over $50', () => {
  test('A keyboard order ships for free', { tag: '@regression' }, async ({ productsPage, shell, cartPage }) => {
    // Given I am logged in as a customer
    // When I open the products page
    await productsPage.goto();
    // And I add "Mechanical Keyboard" to the cart
    await productsPage.addToCart('Mechanical Keyboard');
    // And I open the cart
    await shell.openCart();
    // Then the shipping is "Free"
    await expect(cartPage.shipping).toHaveText('Free');
    // And the cart total is "$79.99"
    await expect(cartPage.total).toHaveText('$79.99');
  });
});
