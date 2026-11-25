import { expect, test } from './fixtures.ts';

test.describe('Login', () => {
  test('customer can sign in with valid credentials', { tag: ['@smoke', '@regression'] }, async ({ page, api, loginPage, productsPage, shell }) => {
    const user = await api.createUser('customer');
    try {
      await loginPage.goto();
      await loginPage.login(user.username, user.password);

      await productsPage.expectLoaded();
      await expect(page).toHaveURL(/#\/products$/);
      await expect(shell.currentUser).toHaveText(`Signed in as ${user.displayName}`);
      await expect(shell.adminLink).toBeHidden();
    } finally {
      await api.deleteUser(user.username);
    }
  });

  test('seeded demo admin can sign in and sees the admin link', { tag: '@regression' }, async ({ loginPage, productsPage, shell }) => {
    await loginPage.goto();
    await loginPage.login('admin', 'admin123');
    await productsPage.expectLoaded();
    await expect(shell.adminLink).toBeVisible();
  });

  test('wrong password shows an error and stays on the login page', { tag: '@regression' }, async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.login('alice', 'not-the-password');

    await expect(loginPage.error).toHaveText('Invalid username or password.');
    await expect(page).toHaveURL(/#\/login$/);
  });

  test('protected page redirects a guest to login and back after sign-in', { tag: '@regression' }, async ({ page, loginPage }) => {
    await page.goto('/#/cart');
    await loginPage.expectVisible();

    await loginPage.login('alice', 'alice123');
    await expect(page).toHaveURL(/#\/cart$/);
    await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
  });
});

test.describe('Logout', () => {
  test.use({ role: 'customer' });

  test('signed-in customer can log out', { tag: '@regression' }, async ({ page, productsPage, shell, loginPage }) => {
    await productsPage.goto();
    await shell.logout();

    await loginPage.expectVisible();
    await page.goto('/#/products');
    await loginPage.expectVisible();
  });
});
