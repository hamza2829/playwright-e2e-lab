import { expect, type Locator, type Page } from '@playwright/test';
import { AppShell } from './AppShell.ts';

export class CartPage {
  readonly shell: AppShell;
  readonly lines: Locator;
  readonly subtotal: Locator;
  readonly shipping: Locator;
  readonly total: Locator;
  readonly emptyMessage: Locator;
  readonly checkoutButton: Locator;

  constructor(readonly page: Page) {
    this.shell = new AppShell(page);
    this.lines = page.getByTestId('cart-line');
    this.subtotal = page.getByTestId('cart-subtotal');
    this.shipping = page.getByTestId('cart-shipping');
    this.total = page.getByTestId('cart-total');
    this.emptyMessage = page.getByTestId('empty-cart');
    this.checkoutButton = page.getByRole('link', { name: 'Proceed to checkout' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/#/cart');
    await expect(this.page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
  }

  line(productName: string): Locator {
    return this.lines.filter({ hasText: productName });
  }

  async setQuantity(productName: string, quantity: number): Promise<void> {
    const input = this.page.getByLabel(`Quantity for ${productName}`);
    await input.fill(String(quantity));
    // The cart saves on "change", which fires when the field loses focus.
    await input.blur();
  }

  async remove(productName: string): Promise<void> {
    await this.page.getByRole('button', { name: `Remove ${productName}` }).click();
  }

  async proceedToCheckout(): Promise<void> {
    await this.checkoutButton.click();
    await expect(this.page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  }
}
