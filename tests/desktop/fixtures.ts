import { _electron as electron, test as base, expect, type ElectronApplication, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NotesWindow } from './pages/NotesWindow.ts';

/**
 * Electron fixtures.
 *
 * - Every test gets its own temporary profile folder (NOTES_DATA_DIR) and a
 *   scratch folder for import/export files; both are deleted in teardown.
 * - Native file dialogs cannot be driven by Playwright, so tests stub
 *   dialog.showOpenDialog / showSaveDialog in the Electron main process.
 * - The runner takes failure screenshots of Electron windows from the config's
 *   `use` block, but video and a full DOM-snapshot trace need the launch
 *   options, so this fixture records both and attaches them only when a test fails.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const appDir = path.join(repoRoot, 'apps', 'desktop');
export const dataFilesDir = path.join(repoRoot, 'tests', 'desktop', 'data');

export interface LaunchedApp {
  app: ElectronApplication;
  window: Page;
  notes: NotesWindow;
}

interface DesktopFixtures {
  /** Isolated Electron userData folder for this test. */
  dataDir: string;
  /** Scratch folder for files the test imports or exports. */
  workDir: string;
  /** Launch the app (again). Each launch is closed, and its evidence collected, in teardown. */
  launchApp: (options?: { dataDir?: string }) => Promise<LaunchedApp>;
  /** The app launched with this test's `dataDir`. */
  desktop: LaunchedApp;
  notes: NotesWindow;
  dialogs: FileDialogs;
}

export interface FileDialogs {
  /** The next "Open" dialog returns this file (or is cancelled when null). */
  nextOpen(filePath: string | null): Promise<void>;
  /** The next "Save" dialog returns this file (or is cancelled when null). */
  nextSave(filePath: string | null): Promise<void>;
}

const failed = (info: TestInfo) => info.status !== info.expectedStatus;

export const test = base.extend<DesktopFixtures>({
  dataDir: async ({}, use) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-notes-profile-'));
    await use(dir);
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3 });
  },

  workDir: async ({}, use) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-notes-files-'));
    await use(dir);
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3 });
  },

  // Depends on workDir so that folder outlives every app launch (Windows keeps
  // profile files locked until Electron exits).
  launchApp: async ({ dataDir, workDir }, use, testInfo) => {
    void workDir;
    const launched: Array<LaunchedApp & { tracePath: string; stopTrace: () => Promise<void> }> = [];
    const videoDir = testInfo.outputPath('videos');

    await use(async (options = {}) => {
      const app = await electron.launch({
        // --no-sandbox: GitHub's Ubuntu 24.04 runners restrict the unprivileged
        // user namespaces Chromium's sandbox needs. Only used for the test build.
        args: [appDir, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
        env: { ...process.env, NOTES_DATA_DIR: options.dataDir ?? dataDir },
        recordVideo: { dir: videoDir },
        timeout: 30_000,
      });
      // The runner's own Electron trace has test steps only; this one adds DOM
      // snapshots, screenshots and console output from the app window.
      await app.context().tracing.start({ screenshots: true, snapshots: true, sources: true, title: testInfo.title });
      const tracePath = testInfo.outputPath(`electron-trace-${launched.length + 1}.zip`);
      let stopped = false;
      const stopTrace = async () => {
        if (stopped) return;
        stopped = true;
        await app.context().tracing.stop({ path: tracePath }).catch(() => {});
      };
      // Tests may close the app themselves (restart scenarios): save the trace first.
      const close = app.close.bind(app);
      app.close = async () => {
        await stopTrace();
        await close();
      };
      const window = await app.firstWindow();
      const notes = new NotesWindow(window);
      const entry = { app, window, notes, tracePath, stopTrace };
      launched.push(entry);
      await notes.expectReady();
      return entry;
    });

    for (const [index, { app, window, tracePath, stopTrace }] of launched.entries()) {
      const suffix = launched.length > 1 ? ` (launch ${index + 1})` : '';
      await stopTrace();
      const video = window.video();
      await app.close().catch(() => {});
      if (failed(testInfo)) {
        await testInfo.attach(`electron trace${suffix}`, { path: tracePath, contentType: 'application/zip' }).catch(() => {});
      } else {
        await fs.rm(tracePath, { force: true });
      }
      const videoPath = video ? await video.path().catch(() => null) : null;
      if (videoPath && failed(testInfo)) await testInfo.attach(`video${suffix}`, { path: videoPath, contentType: 'video/webm' });
      else if (videoPath) await fs.rm(videoPath, { force: true }).catch(() => {});
    }
  },

  desktop: async ({ launchApp }, use) => {
    await use(await launchApp());
  },

  notes: async ({ desktop }, use) => {
    await use(desktop.notes);
  },

  dialogs: async ({ desktop }, use) => {
    await use({
      nextOpen: async (filePath) => {
        await desktop.app.evaluate(({ dialog }, file) => {
          dialog.showOpenDialog = (async () =>
            file ? { canceled: false, filePaths: [file] } : { canceled: true, filePaths: [] }) as typeof dialog.showOpenDialog;
        }, filePath);
      },
      nextSave: async (filePath) => {
        await desktop.app.evaluate(({ dialog }, file) => {
          dialog.showSaveDialog = (async () =>
            file ? { canceled: false, filePath: file } : { canceled: true, filePath: '' }) as typeof dialog.showSaveDialog;
        }, filePath);
      },
    });
  },
});

export { expect };
