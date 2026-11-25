// Drafted by the genai helper (mock adapter) from genai/stories/quantity-subtotal.md.
// Reviewed against genai/REVIEW_CHECKLIST.md. Changes made in review:
// - R4/R5: the subtotal step was left as a TODO, so the draft passed without checking the subtotal. Added the assertion.
import { test, expect } from '../fixtures.ts';

test.use({ role: 'customer' });

test.describe('Change quantities in the cart', () => {
  test('Raising the quantity updates the subtotal', { tag: '@regression' }, async ({ productsPage, shell, cartPage }) => {
    // Given I am logged in as a customer
    // When I open the products page
    await productsPage.goto();
    // And I add "Wireless Mouse" to the cart
    await productsPage.addToCart('Wireless Mouse');
    // And I open the cart
    await shell.openCart();
    // And I set the quantity of "Wireless Mouse" to 3
    await cartPage.setQuantity('Wireless Mouse', 3);
    // Then the cart subtotal is "$74.97"
    await expect(cartPage.subtotal).toHaveText('$74.97');
    // And the cart badge shows 3
    await shell.expectCartCount(3);
  });
});
