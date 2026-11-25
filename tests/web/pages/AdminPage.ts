import { expect, type Locator, type Page } from '@playwright/test';

export class AdminPage {
  readonly heading: Locator;
  readonly accessDenied: Locator;
  readonly inventoryRows: Locator;
  readonly orderRows: Locator;
  readonly error: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Admin', exact: true });
    this.accessDenied = page.getByTestId('access-denied');
    this.inventoryRows = page.getByTestId('inventory-row');
    this.orderRows = page.getByTestId('admin-order-row');
    this.error = page.getByTestId('admin-error');
  }

  async goto(): Promise<void> {
    await this.page.goto('/#/admin');
    await expect(this.heading).toBeVisible();
  }

  async createProduct(input: { name: string; category?: string; price: string; stock: number }): Promise<void> {
    const form = this.page.getByTestId('new-product-form');
    await form.getByLabel('Name').fill(input.name);
    if (input.category) await form.getByLabel('Category').fill(input.category);
    await form.getByLabel('Price (USD)').fill(input.price);
    await form.getByLabel('Stock').fill(String(input.stock));
    await form.getByRole('button', { name: 'Create product' }).click();
  }

  inventoryRow(name: string): Locator {
    return this.inventoryRows.filter({ hasText: name });
  }

  async deleteProduct(name: string): Promise<void> {
    await this.page.getByRole('button', { name: `Delete ${name}` }).click();
  }
}
