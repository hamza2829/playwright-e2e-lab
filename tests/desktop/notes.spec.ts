import { expect, test } from './fixtures.ts';

test.describe('Lab Notes basics', () => {
  test('app starts with an empty notebook', { tag: ['@smoke', '@regression'] }, async ({ desktop, notes }) => {
    expect(await desktop.window.title()).toBe('Lab Notes');
    await expect(notes.emptyState).toBeVisible();
    await expect(notes.count).toHaveText('0 notes');
    await expect(notes.status).toHaveText('Ready');
  });

  test('create and edit a note', { tag: ['@smoke', '@regression'] }, async ({ notes }) => {
    await notes.createNote('Shopping', 'Bread');
    await notes.expectTitles(['Shopping']);
    await expect(notes.count).toHaveText('1 note');
    await expect(notes.emptyState).toBeHidden();

    await notes.title.fill('Shopping list');
    await notes.body.fill('Bread, butter');
    await notes.saveButton.click();
    await expect(notes.status).toHaveText('Saved "Shopping list"');
    await notes.expectTitles(['Shopping list']);
  });

  test('notes persist across an app restart', { tag: '@regression' }, async ({ desktop, launchApp }) => {
    await desktop.notes.createNote('Persistent', 'Still here after restart');
    await desktop.app.close();

    const second = await launchApp(); // same profile folder
    await second.notes.expectTitles(['Persistent']);
    await second.notes.open('Persistent');
    await expect(second.notes.body).toHaveValue('Still here after restart');
  });

  test('a note without a title is not saved', { tag: '@regression' }, async ({ notes }) => {
    await notes.newButton.click();
    await notes.body.fill('Body without a title');
    await notes.saveButton.click();

    await expect(notes.status).toHaveText('Title is required.');
    await expect(notes.status).toHaveAttribute('data-kind', 'error');
    await expect(notes.items).toHaveCount(0);
  });

  test('delete a note', { tag: '@regression' }, async ({ notes }) => {
    await notes.createNote('Keep', 'a');
    await notes.createNote('Remove me', 'b');

    await notes.open('Remove me');
    await notes.deleteOpenNote();
    await notes.expectTitles(['Keep']);
  });

  test('search filters notes by title and body', { tag: '@regression' }, async ({ notes }) => {
    await notes.createNote('Alpha', 'first letter');
    await notes.createNote('Beta', 'second letter');
    await notes.createNote('Gamma', 'contains keyword zebra');

    await notes.search.fill('zebra');
    await notes.expectTitles(['Gamma']);
    await notes.search.fill('letter');
    await notes.expectTitles(['Alpha', 'Beta']);
    await notes.search.fill('');
    await expect(notes.items).toHaveCount(3);
  });
});
