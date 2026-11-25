import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mergeNotes, parseImport, serializeExport, type Note } from './notes-format';

/**
 * Lab Notes: a small Electron notes app used as the desktop system under test.
 *
 * NOTES_DATA_DIR overrides Electron's userData folder so each test run gets an
 * isolated, throwaway profile.
 */

if (process.env.NOTES_DATA_DIR) app.setPath('userData', process.env.NOTES_DATA_DIR);

let mainWindow: BrowserWindow | null = null;
let notes: Note[] = [];

const notesFile = () => path.join(app.getPath('userData'), 'notes.json');

async function loadNotes(): Promise<Note[]> {
  try {
    const data = JSON.parse(await fs.readFile(notesFile(), 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function persist(): Promise<void> {
  const file = notesFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(notes, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function registerIpc(): void {
  ipcMain.handle('notes:list', () => notes);

  ipcMain.handle('notes:save', async (_event, input: { id?: string; title: string; body: string }) => {
    const title = String(input?.title ?? '').trim();
    if (!title) return { error: 'Title is required.' };
    const body = String(input?.body ?? '');
    const now = new Date().toISOString();
    const existing = input.id ? notes.find((n) => n.id === input.id) : undefined;
    let saved: Note;
    if (existing) {
      Object.assign(existing, { title, body, updatedAt: now });
      saved = existing;
    } else {
      saved = { id: randomUUID(), title, body, updatedAt: now };
      notes.push(saved);
    }
    await persist();
    return { note: saved };
  });

  ipcMain.handle('notes:delete', async (_event, id: string) => {
    const before = notes.length;
    notes = notes.filter((n) => n.id !== id);
    await persist();
    return { deleted: before - notes.length };
  });

  ipcMain.handle('notes:import', async () => {
    const options: Electron.OpenDialogOptions = {
      title: 'Import notes',
      properties: ['openFile'],
      filters: [{ name: 'Notes', extensions: ['json', 'md', 'markdown'] }],
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    const file = result.filePaths?.[0];
    if (result.canceled || !file) return { canceled: true };
    try {
      const parsed = parseImport(await fs.readFile(file, 'utf8'), path.extname(file));
      if ('error' in parsed) return { error: parsed.error };
      const merged = mergeNotes(notes, parsed.notes, randomUUID);
      notes = merged.notes;
      await persist();
      return { imported: merged.imported, skipped: merged.skipped, file: path.basename(file) };
    } catch (err) {
      return { error: `Could not read file: ${errorMessage(err)}` };
    }
  });

  ipcMain.handle('notes:export', async () => {
    if (notes.length === 0) return { error: 'There are no notes to export.' };
    const options: Electron.SaveDialogOptions = {
      title: 'Export notes',
      defaultPath: 'notes-export.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { canceled: true };
    try {
      await fs.writeFile(result.filePath, serializeExport(notes), 'utf8');
      return { exported: notes.length, file: path.basename(result.filePath) };
    } catch (err) {
      return { error: `Could not write file: ${errorMessage(err)}` };
    }
  });
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: 'Lab Notes',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  await mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  notes = await loadNotes();
  registerIpc();
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
