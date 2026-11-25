import { test as base, expect } from '@playwright/test';
import { AdminPage } from './pages/AdminPage.ts';
import { AppShell } from './pages/AppShell.ts';
import { CartPage } from './pages/CartPage.ts';
import { CheckoutPage, OrderConfirmationPage } from './pages/CheckoutPage.ts';
import { LoginPage } from './pages/LoginPage.ts';
import { ProductsPage } from './pages/ProductsPage.ts';
import { ShopApi, uniqueName, type Product, type Session, type TestUser } from './support/shop-api.ts';

/**
 * Shared fixtures for the web suite.
 *
 * Login state: choose it per file or describe block with
 *   test.use({ role: 'customer' })   // or 'admin' / 'guest' (default)
 * Each test then gets a brand-new user created through the test API, a session
 * token injected into localStorage before the app loads, and the user deleted
 * again in teardown. No test shares a user or a cart with another test, so the
 * suite is safe to run fully parallel across workers and browsers.
 */

type Role = 'guest' | 'customer' | 'admin';

interface Options {
  role: Role;
}

interface Fixtures {
  api: ShopApi;
  /** The user this test runs as (null for guests). Created before and deleted after the test. */
  user: TestUser | null;
  /** API session for `user`, handy for arranging data (cart, orders) without the UI. */
  session: Session | null;
  /** A short-lived admin session for data setup, independent of the test's own role. */
  adminSession: Session;
  /** Factory for temporary products; every product it creates is deleted in teardown. */
  createProduct: (overrides?: Partial<Omit<Product, 'id'>>) => Promise<Product>;

  shell: AppShell;
  loginPage: LoginPage;
  productsPage: ProductsPage;
  cartPage: CartPage;
  checkoutPage: CheckoutPage;
  confirmationPage: OrderConfirmationPage;
  adminPage: AdminPage;
}

export const test = base.extend<Options & Fixtures>({
  role: ['guest', { option: true }],

  api: async ({ request }, use) => {
    await use(new ShopApi(request));
  },

  user: async ({ role, api }, use) => {
    if (role === 'guest') {
      await use(null);
      return;
    }
    const user = await api.createUser(role);
    await use(user);
    await api.deleteUser(user.username); // teardown: also removes the user's cart and orders
  },

  session: async ({ user, api }, use) => {
    await use(user ? await api.login(user.username, user.password) : null);
  },

  adminSession: async ({ api }, use) => {
    const admin = await api.createUser('admin');
    await use(await api.login(admin.username, admin.password));
    await api.deleteUser(admin.username);
  },

  createProduct: async ({ api, adminSession }, use) => {
    const created: Product[] = [];
    await use(async (overrides = {}) => {
      const product = await api.createProduct(adminSession.token, {
        name: uniqueName('E2E Product'),
        category: 'E2E',
        priceCents: 1000,
        stock: 5,
        ...overrides,
      });
      created.push(product);
      return product;
    });
    for (const product of created) await api.deleteProduct(adminSession.token, product.id);
  },

  // Override the built-in page: when the test has a signed-in role, seed the
  // session into localStorage before any app script runs. This is the
  // "login state" fixture: tests that are not about login skip the login UI.
  page: async ({ page, session }, use) => {
    if (session) {
      await page.addInitScript(
        ([token, user]) => {
          if (sessionStorage.getItem('e2e.seeded')) return; // seed once, so logout stays logged out
          localStorage.setItem('shop.token', token);
          localStorage.setItem('shop.user', JSON.stringify(user));
          sessionStorage.setItem('e2e.seeded', '1');
        },
        [session.token, session.user] as const,
      );
    }
    await use(page);
  },

  shell: async ({ page }, use) => use(new AppShell(page)),
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  productsPage: async ({ page }, use) => use(new ProductsPage(page)),
  cartPage: async ({ page }, use) => use(new CartPage(page)),
  checkoutPage: async ({ page }, use) => use(new CheckoutPage(page)),
  confirmationPage: async ({ page }, use) => use(new OrderConfirmationPage(page)),
  adminPage: async ({ page }, use) => use(new AdminPage(page)),
});

export { expect };
export { money, uniqueName } from './support/shop-api.ts';
export { VALID_SHIPPING } from './pages/CheckoutPage.ts';
