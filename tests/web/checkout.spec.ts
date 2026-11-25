import { expect, money, test, VALID_SHIPPING } from './fixtures.ts';

test.use({ role: 'customer' });

test.describe('Checkout', () => {
  test('customer buys a product end to end', { tag: ['@smoke', '@regression'] }, async ({ api, session, productsPage, cartPage, checkoutPage, confirmationPage }) => {
    await test.step('add a product from the catalog', async () => {
      await productsPage.goto();
      await productsPage.addToCart('Mechanical Keyboard');
    });

    await test.step('review the cart', async () => {
      await productsPage.shell.openCart();
      await expect(cartPage.total).toHaveText('$79.99');
      await cartPage.proceedToCheckout();
    });

    const orderId = await test.step('enter shipping details and place the order', async () => {
      await expect(checkoutPage.total).toHaveText('$79.99');
      await checkoutPage.submit(VALID_SHIPPING);
      return confirmationPage.expectConfirmed();
    });

    await test.step('order is confirmed and the cart is emptied', async () => {
      await expect(confirmationPage.total).toHaveText('$79.99');
      await productsPage.shell.expectCartCount(0);
      const orders = await api.orders(session!.token);
      expect(orders.map((o) => o.id)).toEqual([orderId]);
    });
  });

  test('missing and invalid fields are reported per field', { tag: '@regression' }, async ({ api, session, checkoutPage }) => {
    const mat = await api.productByName('Desk Mat');
    await api.addToCart(session!.token, mat.id);

    await checkoutPage.goto();
    await checkoutPage.submit({ fullName: '', address: '1 Test Street', postalCode: 'ABC', paymentMethod: undefined });

    await expect(checkoutPage.error).toHaveText('Please fix the highlighted fields.');
    await expect(checkoutPage.fieldError('fullName')).toHaveText('Enter your full name.');
    await expect(checkoutPage.fieldError('postalCode')).toHaveText('Postal code must be 5 digits.');
    await expect(checkoutPage.fieldError('paymentMethod')).toHaveText('Choose a payment method.');
    await expect(checkoutPage.fieldError('address')).toBeEmpty();
    await expect(checkoutPage.page.getByLabel('Postal code')).toHaveAttribute('aria-invalid', 'true');
    expect(await api.orders(session!.token)).toHaveLength(0);
  });

  test('checkout with an empty cart is blocked', { tag: '@regression' }, async ({ checkoutPage }) => {
    await checkoutPage.goto();
    await expect(checkoutPage.emptyCartAlert).toBeVisible();
    await expect(checkoutPage.placeOrder).toHaveCount(0);
  });

  test('placing an order decrements stock', { tag: '@regression' }, async ({ api, session, createProduct, checkoutPage, confirmationPage }) => {
    const product = await createProduct({ stock: 3, priceCents: 6000 });
    await api.addToCart(session!.token, product.id, 2);

    await checkoutPage.goto();
    await expect(checkoutPage.total).toHaveText(money(12000));
    await checkoutPage.submit({ ...VALID_SHIPPING, paymentMethod: 'Cash on delivery' });
    await confirmationPage.expectConfirmed();

    const after = (await api.products()).find((p) => p.id === product.id);
    expect(after?.stock).toBe(1);
  });
});
