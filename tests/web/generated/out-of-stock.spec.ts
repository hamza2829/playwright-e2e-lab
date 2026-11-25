// Drafted by the genai helper (mock adapter) from genai/stories/out-of-stock.md.
// Reviewed against genai/REVIEW_CHECKLIST.md. Changes made in review:
// - R4: both the setup step and the Then step were TODOs; the draft passed while testing nothing.
// - R8: the product is created through the createProduct fixture with a unique name (the story's fixed
//   "Sold Out Lamp" would collide when browsers run in parallel) and is deleted in teardown.
import { test, expect, uniqueName } from '../fixtures.ts';

test.use({ role: 'customer' });

test.describe('Out-of-stock products', () => {
  test('A product with no stock cannot be added', { tag: '@regression' }, async ({ productsPage, createProduct }) => {
    // Given I am logged in as a customer
    // And a product "Sold Out Lamp" with stock 0 exists
    const product = await createProduct({ name: uniqueName('Sold Out Lamp'), stock: 0 });
    // When I open the products page
    await productsPage.goto();
    // Then the product "Sold Out Lamp" is marked out of stock
    await expect(productsPage.card(product.name).getByRole('button', { name: 'Out of stock' })).toBeDisabled();
    await expect(productsPage.addButton(product.name)).toHaveCount(0);
  });
});
