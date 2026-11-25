import { expect, type Locator, type Page } from '@playwright/test';

/** Page object for the Lab Notes main window. */
export class NotesWindow {
  readonly items: Locator;
  readonly emptyState: Locator;
  readonly count: Locator;
  readonly status: Locator;
  readonly search: Locator;
  readonly title: Locator;
  readonly body: Locator;
  readonly saveButton: Locator;
  readonly deleteButton: Locator;
  readonly newButton: Locator;
  readonly importButton: Locator;
  readonly exportButton: Locator;

  constructor(readonly page: Page) {
    this.items = page.getByTestId('note-item');
    this.emptyState = page.getByTestId('empty-state');
    this.count = page.getByTestId('note-count');
    this.status = page.getByTestId('status');
    this.search = page.getByTestId('search');
    this.title = page.getByLabel('Title');
    this.body = page.getByLabel('Body');
    this.saveButton = page.getByRole('button', { name: 'Save' });
    this.deleteButton = page.getByRole('button', { name: 'Delete' });
    this.newButton = page.getByRole('button', { name: 'New note' });
    this.importButton = page.getByRole('button', { name: 'Import…' });
    this.exportButton = page.getByRole('button', { name: 'Export…' });
  }

  async expectReady(): Promise<void> {
    await expect(this.page.locator('body')).toHaveAttribute('data-ready', 'true');
  }

  item(title: string): Locator {
    return this.items.filter({ hasText: title });
  }

  async createNote(title: string, body: string): Promise<void> {
    await this.newButton.click();
    await this.title.fill(title);
    await this.body.fill(body);
    await this.saveButton.click();
    await expect(this.status).toHaveText(`Saved "${title}"`);
  }

  async open(title: string): Promise<void> {
    await this.item(title).click();
    await expect(this.title).toHaveValue(title);
  }

  async deleteOpenNote(): Promise<void> {
    await this.deleteButton.click();
    await expect(this.status).toHaveText('Note deleted');
  }

  async expectTitles(titles: string[]): Promise<void> {
    await expect(this.items).toHaveText(titles);
  }
}
