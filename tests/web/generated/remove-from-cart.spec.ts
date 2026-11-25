// Drafted by the genai helper (mock adapter) from genai/stories/remove-from-cart.md.
// Reviewed against genai/REVIEW_CHECKLIST.md: accepted without changes.
import { test, expect } from '../fixtures.ts';

test.use({ role: 'customer' });

test.describe('Remove an item from the cart', () => {
  test('Removing the only item empties the cart', { tag: '@regression' }, async ({ productsPage, shell, cartPage }) => {
    // Given I am logged in as a customer
    // When I open the products page
    await productsPage.goto();
    // And I add "Desk Mat" to the cart
    await productsPage.addToCart('Desk Mat');
    // And I open the cart
    await shell.openCart();
    // And I remove "Desk Mat" from the cart
    await cartPage.remove('Desk Mat');
    // Then I see the empty cart message
    await expect(cartPage.emptyMessage).toBeVisible();
    // And the cart badge shows 0
    await shell.expectCartCount(0);
  });
});
