import { expect, test } from './fixtures.ts';

test.use({ role: 'customer' });

test.describe('Cart', () => {
  test('adding a product updates the cart badge and the cart page', { tag: ['@smoke', '@regression'] }, async ({ productsPage, cartPage }) => {
    await productsPage.goto();
    await productsPage.shell.expectCartCount(0);

    await productsPage.addToCart('Wireless Mouse');
    await expect(productsPage.shell.toast).toHaveText('Added to cart');

    await productsPage.shell.openCart();
    await expect(cartPage.lines).toHaveCount(1);
    await expect(cartPage.line('Wireless Mouse').getByTestId('line-total')).toHaveText('$24.99');
  });

  test('changing quantity recalculates totals and shipping', { tag: '@regression' }, async ({ api, session, cartPage }) => {
    // Arrange through the API: this test is about the cart page, not about adding items.
    const mouse = await api.productByName('Wireless Mouse');
    await api.addToCart(session!.token, mouse.id, 1);

    await cartPage.goto();
    await expect(cartPage.subtotal).toHaveText('$24.99');
    await expect(cartPage.shipping).toHaveText('$4.99');
    await expect(cartPage.total).toHaveText('$29.98');

    await cartPage.setQuantity('Wireless Mouse', 3);
    await expect(cartPage.subtotal).toHaveText('$74.97');
    await expect(cartPage.shipping).toHaveText('Free'); // free shipping from $50
    await expect(cartPage.total).toHaveText('$74.97');
    await cartPage.shell.expectCartCount(3);
  });

  test('removing the last item shows the empty state', { tag: '@regression' }, async ({ api, session, cartPage }) => {
    const hub = await api.productByName('USB-C Hub');
    await api.addToCart(session!.token, hub.id, 2);

    await cartPage.goto();
    await cartPage.remove('USB-C Hub');

    await expect(cartPage.emptyMessage).toHaveText('Your cart is empty.');
    await cartPage.shell.expectCartCount(0);
    expect((await api.cart(session!.token)).lines).toHaveLength(0);
  });
});
