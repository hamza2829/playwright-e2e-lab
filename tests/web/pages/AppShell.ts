import { expect, type Locator, type Page } from '@playwright/test';

/** Header, navigation and toast: present on every signed-in page. */
export class AppShell {
  readonly cartCount: Locator;
  readonly currentUser: Locator;
  readonly adminLink: Locator;
  readonly logoutButton: Locator;
  readonly toast: Locator;

  constructor(readonly page: Page) {
    this.cartCount = page.getByTestId('cart-count');
    this.currentUser = page.getByTestId('current-user');
    this.adminLink = page.getByTestId('nav-admin');
    this.logoutButton = page.getByTestId('logout');
    this.toast = page.getByTestId('toast');
  }

  async openCart(): Promise<void> {
    await this.page.getByTestId('nav-cart').click();
    await expect(this.page).toHaveURL(/#\/cart$/);
    await expect(this.page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
  }

  async logout(): Promise<void> {
    await this.logoutButton.click();
  }

  async expectCartCount(count: number): Promise<void> {
    await expect(this.cartCount).toHaveText(String(count));
  }
}
