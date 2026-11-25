import { expect, test } from './fixtures.ts';

// API-level checks run once (Chromium project only): they do not depend on the browser.
test.describe('Shop API contract', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'API checks are browser independent');

  test('cart endpoints require authentication', { tag: '@regression' }, async ({ request }) => {
    expect((await request.get('/api/cart')).status()).toBe(401);
    expect((await request.post('/api/cart', { data: { productId: 'p-1001' } })).status()).toBe(401);
  });

  test('admin endpoints reject customers', { tag: '@regression' }, async ({ request, api }) => {
    const user = await api.createUser('customer');
    try {
      const { token } = await api.login(user.username, user.password);
      const res = await request.get('/api/admin/orders', { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status()).toBe(403);
    } finally {
      await api.deleteUser(user.username);
    }
  });

  test('checkout validates the payload', { tag: '@regression' }, async ({ request, api }) => {
    const user = await api.createUser('customer');
    try {
      const { token } = await api.login(user.username, user.password);
      const res = await request.post('/api/checkout', { headers: { Authorization: `Bearer ${token}` }, data: {} });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(Object.keys(body.fields).sort()).toEqual(['address', 'fullName', 'paymentMethod', 'postalCode']);
    } finally {
      await api.deleteUser(user.username);
    }
  });
});
