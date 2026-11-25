import { expect, test, uniqueName, VALID_SHIPPING } from './fixtures.ts';

test.describe('Admin page', () => {
  test.describe('as admin', () => {
    test.use({ role: 'admin' });

    test('admin creates a product that customers can see', { tag: ['@smoke', '@regression'] }, async ({ api, adminPage, session, productsPage }) => {
      const name = uniqueName('Admin Widget');
      await adminPage.goto();
      await adminPage.createProduct({ name, category: 'E2E', price: '19.50', stock: 4 });

      await expect(adminPage.inventoryRow(name)).toContainText('$19.50');
      await expect(adminPage.inventoryRow(name).getByTestId('inventory-stock')).toHaveText('4');

      await productsPage.goto();
      await expect(productsPage.card(name)).toBeVisible();

      // Teardown for data created through the UI.
      const created = (await api.products()).find((p) => p.name === name);
      if (created) await api.deleteProduct(session!.token, created.id);
    });

    test('admin deletes a product', { tag: '@regression' }, async ({ adminPage, createProduct }) => {
      const product = await createProduct();
      await adminPage.goto();
      await expect(adminPage.inventoryRow(product.name)).toBeVisible();

      await adminPage.deleteProduct(product.name);
      await expect(adminPage.inventoryRow(product.name)).toHaveCount(0);
    });

    test('invalid product input is rejected', { tag: '@regression' }, async ({ adminPage }) => {
      await adminPage.goto();
      await adminPage.createProduct({ name: uniqueName('Bad Price'), price: '-1', stock: 1 });
      await expect(adminPage.error).toHaveText('Price must be positive and stock zero or more.');
    });

    test('orders placed by customers appear in the admin order list', { tag: '@regression' }, async ({ api, adminPage, request }) => {
      // Arrange: a separate customer places an order entirely through the API.
      const customer = await api.createUser('customer');
      try {
        const session = await api.login(customer.username, customer.password);
        const hub = await api.productByName('USB-C Hub');
        await api.addToCart(session.token, hub.id);
        const res = await request.post('/api/checkout', {
          headers: { Authorization: `Bearer ${session.token}` },
          data: { ...VALID_SHIPPING, paymentMethod: 'invoice' },
        });
        expect(res.status()).toBe(201);
        const order = await res.json();

        await adminPage.goto();
        await expect(adminPage.orderRows.filter({ hasText: order.id })).toContainText(customer.username);
      } finally {
        await api.deleteUser(customer.username);
      }
    });
  });

  test.describe('as customer', () => {
    test.use({ role: 'customer' });

    test('customer is denied access to the admin page', { tag: ['@smoke', '@regression'] }, async ({ page, adminPage, shell }) => {
      await adminPage.goto();
      await expect(adminPage.accessDenied).toHaveText('Access denied. Admins only.');
      await expect(shell.adminLink).toBeHidden();
      await expect(page.getByTestId('new-product-form')).toHaveCount(0);
    });
  });
});
