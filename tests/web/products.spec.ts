import { expect, money, test } from './fixtures.ts';

test.use({ role: 'customer' });

test.describe('Product list', () => {
  test('shows the seeded catalog with prices', { tag: ['@smoke', '@regression'] }, async ({ productsPage }) => {
    await productsPage.goto();

    await expect(productsPage.card('Mechanical Keyboard')).toBeVisible();
    await expect(productsPage.card('Mechanical Keyboard').getByTestId('product-price')).toHaveText('$79.99');
    expect(await productsPage.cards.count()).toBeGreaterThanOrEqual(8);
  });

  test('search filters by name and category', { tag: '@regression' }, async ({ productsPage }) => {
    await productsPage.goto();

    await productsPage.filter('mouse');
    await expect(productsPage.cards).toHaveCount(1);
    await expect(productsPage.card('Wireless Mouse')).toBeVisible();

    await productsPage.filter('Audio');
    await expect(productsPage.card('Noise-Cancelling Headphones')).toBeVisible();

    await productsPage.filter('zzz-no-such-product');
    await expect(productsPage.noResults).toBeVisible();
    await expect(productsPage.count).toHaveText('0 products');
  });

  test('out-of-stock product cannot be added to the cart', { tag: '@regression' }, async ({ productsPage, createProduct }) => {
    const product = await createProduct({ stock: 0, priceCents: 1250 });
    await productsPage.goto();

    const card = productsPage.card(product.name);
    await expect(card.getByTestId('product-price')).toHaveText(money(1250));
    await expect(card.getByRole('button', { name: 'Out of stock' })).toBeDisabled();
    await expect(card.getByRole('button', { name: 'Add to cart' })).toHaveCount(0);
  });
});
