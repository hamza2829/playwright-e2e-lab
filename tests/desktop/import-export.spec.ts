import fs from 'node:fs/promises';
import path from 'node:path';
import { dataFilesDir, expect, test } from './fixtures.ts';

const sample = (name: string) => path.join(dataFilesDir, name);

test.describe('Import', () => {
  test('import notes from a JSON file', { tag: ['@smoke', '@regression'] }, async ({ notes, dialogs }) => {
    await dialogs.nextOpen(sample('sample-notes.json'));
    await notes.importButton.click();

    await expect(notes.status).toHaveText('Imported 2 notes from sample-notes.json');
    await notes.expectTitles(['Groceries', 'Release checklist']);
    await notes.open('Groceries');
    await expect(notes.body).toHaveValue('Milk, eggs, coffee');
  });

  test('import notes from a Markdown file', { tag: '@regression' }, async ({ notes, dialogs }) => {
    await dialogs.nextOpen(sample('sample-notes.md'));
    await notes.importButton.click();

    await expect(notes.status).toHaveText('Imported 2 notes from sample-notes.md');
    await notes.expectTitles(['Meeting notes', 'Ideas']);
    await notes.open('Ideas');
    await expect(notes.body).toHaveValue('- Add WebKit to the matrix\n- Track flaky tests');
  });

  test('invalid file shows an error and imports nothing', { tag: '@regression' }, async ({ notes, dialogs }) => {
    await dialogs.nextOpen(sample('invalid.json'));
    await notes.importButton.click();

    await expect(notes.status).toHaveText('Import failed: File is not valid JSON.');
    await expect(notes.status).toHaveAttribute('data-kind', 'error');
    await expect(notes.items).toHaveCount(0);
  });

  test('importing the same file twice skips duplicates', { tag: '@regression' }, async ({ notes, dialogs }) => {
    await dialogs.nextOpen(sample('sample-notes.json'));
    await notes.importButton.click();
    await expect(notes.status).toHaveText('Imported 2 notes from sample-notes.json');

    await notes.importButton.click();
    await expect(notes.status).toHaveText('Imported 0 notes from sample-notes.json (2 duplicates skipped)');
    await expect(notes.items).toHaveCount(2);
  });

  test('cancelling the open dialog changes nothing', { tag: '@regression' }, async ({ notes, dialogs }) => {
    await dialogs.nextOpen(null);
    await notes.importButton.click();
    await expect(notes.status).toHaveText('Import canceled');
    await expect(notes.items).toHaveCount(0);
  });
});

test.describe('Export', () => {
  test('export writes all notes to a JSON file', { tag: ['@smoke', '@regression'] }, async ({ notes, dialogs, workDir }) => {
    await notes.createNote('First', 'one');
    await notes.createNote('Second', 'two');
    const target = path.join(workDir, 'backup.json');

    await dialogs.nextSave(target);
    await notes.exportButton.click();
    await expect(notes.status).toHaveText('Exported 2 notes to backup.json');

    const exported = JSON.parse(await fs.readFile(target, 'utf8'));
    expect(exported).toMatchObject({ app: 'lab-notes', version: 1 });
    expect(exported.notes.map((n: { title: string; body: string }) => [n.title, n.body])).toEqual([
      ['First', 'one'],
      ['Second', 'two'],
    ]);
  });

  test('export with no notes is refused', { tag: '@regression' }, async ({ notes, dialogs, workDir }) => {
    const target = path.join(workDir, 'empty.json');
    await dialogs.nextSave(target);
    await notes.exportButton.click();

    await expect(notes.status).toHaveText('Export failed: There are no notes to export.');
    await expect(fs.access(target)).rejects.toThrow();
  });

  test('exported file round-trips into a fresh profile', { tag: '@regression' }, async ({ desktop, notes, dialogs, workDir, launchApp }) => {
    await notes.createNote('Round trip', 'multi\nline body');
    const target = path.join(workDir, 'roundtrip.json');
    await dialogs.nextSave(target);
    await notes.exportButton.click();
    await expect(notes.status).toHaveText('Exported 1 note to roundtrip.json');
    await desktop.app.close();

    const freshProfile = await fs.mkdtemp(path.join(workDir, 'profile-'));
    const fresh = await launchApp({ dataDir: freshProfile });
    await expect(fresh.notes.items).toHaveCount(0);
    await fresh.app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog;
    }, target);
    await fresh.notes.importButton.click();

    await expect(fresh.notes.status).toHaveText('Imported 1 note from roundtrip.json');
    await fresh.notes.open('Round trip');
    await expect(fresh.notes.body).toHaveValue('multi\nline body');
  });
});
