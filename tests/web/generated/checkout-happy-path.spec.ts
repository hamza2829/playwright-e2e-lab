// Drafted by the genai helper (mock adapter) from genai/stories/checkout-happy-path.md.
// Reviewed against genai/REVIEW_CHECKLIST.md: accepted without changes.
import { test, VALID_SHIPPING } from '../fixtures.ts';

test.use({ role: 'customer' });

test.describe('Place an order', () => {
  test('Checkout with valid details confirms the order', { tag: ['@smoke', '@regression'] }, async ({ productsPage, shell, cartPage, checkoutPage, confirmationPage }) => {
    // Given I am logged in as a customer
    // When I open the products page
    await productsPage.goto();
    // And I add "Laptop Stand" to the cart
    await productsPage.addToCart('Laptop Stand');
    // And I open the cart
    await shell.openCart();
    // And I proceed to checkout
    await cartPage.proceedToCheckout();
    // And I place the order with valid shipping details
    await checkoutPage.submit(VALID_SHIPPING);
    // Then I see an order confirmation
    await confirmationPage.expectConfirmed();
    // And the cart badge shows 0
    await shell.expectCartCount(0);
  });
});
