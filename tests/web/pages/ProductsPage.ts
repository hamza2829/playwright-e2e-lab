import { expect, type Locator, type Page } from '@playwright/test';
import { AppShell } from './AppShell.ts';

export class ProductsPage {
  readonly shell: AppShell;
  readonly heading: Locator;
  readonly list: Locator;
  readonly cards: Locator;
  readonly search: Locator;
  readonly count: Locator;
  readonly noResults: Locator;

  constructor(readonly page: Page) {
    this.shell = new AppShell(page);
    this.heading = page.getByRole('heading', { name: 'Products' });
    this.list = page.getByTestId('product-list');
    this.cards = page.getByTestId('product-card');
    this.search = page.getByTestId('product-search');
    this.count = page.getByTestId('product-count');
    this.noResults = page.getByTestId('no-results');
  }

  async goto(): Promise<void> {
    await this.page.goto('/#/products');
    await this.expectLoaded();
  }

  async expectLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.list).toHaveAttribute('aria-busy', 'false');
  }

  card(name: string): Locator {
    return this.page.getByRole('article', { name, exact: true });
  }

  addButton(name: string): Locator {
    return this.card(name).getByRole('button', { name: 'Add to cart' });
  }

  async addToCart(name: string): Promise<void> {
    const before = Number(await this.shell.cartCount.textContent());
    await this.addButton(name).click();
    // Web-first assertion: retries until the async cart update lands instead of sleeping.
    await this.shell.expectCartCount(before + 1);
  }

  async filter(query: string): Promise<void> {
    await this.search.fill(query);
  }
}
