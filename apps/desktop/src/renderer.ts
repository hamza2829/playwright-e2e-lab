// Renderer script for Lab Notes (a plain script, not a module: it is loaded
// directly by renderer/index.html and talks to the main process via window.notesApi).

interface RendererNote {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
}

type ApiResult = { error?: string; canceled?: boolean; [key: string]: unknown };

interface Window {
  notesApi: {
    list(): Promise<RendererNote[]>;
    save(input: { id?: string; title: string; body: string }): Promise<ApiResult & { note?: RendererNote }>;
    remove(id: string): Promise<ApiResult>;
    importFile(): Promise<ApiResult & { imported?: number; skipped?: number; file?: string }>;
    exportFile(): Promise<ApiResult & { exported?: number; file?: string }>;
  };
}

(() => {
  const $ = <T extends HTMLElement>(testId: string) => document.querySelector(`[data-testid="${testId}"]`) as T;

  const list = $<HTMLUListElement>('note-list');
  const empty = $<HTMLParagraphElement>('empty-state');
  const count = $<HTMLSpanElement>('note-count');
  const search = $<HTMLInputElement>('search');
  const form = $<HTMLFormElement>('editor');
  const titleInput = $<HTMLInputElement>('note-title');
  const bodyInput = $<HTMLTextAreaElement>('note-body');
  const deleteButton = $<HTMLButtonElement>('delete-note');
  const status = $<HTMLDivElement>('status');

  let notes: RendererNote[] = [];
  let selectedId: string | null = null;

  function setStatus(message: string, kind: 'info' | 'error' = 'info'): void {
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function draw(): void {
    const q = search.value.trim().toLowerCase();
    const visible = notes.filter((n) => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
    list.replaceChildren(
      ...visible.map((note) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.testid = 'note-item';
        button.dataset.id = note.id;
        button.textContent = note.title;
        button.setAttribute('aria-current', String(note.id === selectedId));
        button.addEventListener('click', () => select(note.id));
        li.append(button);
        return li;
      }),
    );
    count.textContent = `${notes.length} note${notes.length === 1 ? '' : 's'}`;
    empty.hidden = notes.length > 0;
    deleteButton.disabled = selectedId === null;
  }

  function select(id: string | null): void {
    selectedId = id;
    const note = notes.find((n) => n.id === id);
    titleInput.value = note?.title ?? '';
    bodyInput.value = note?.body ?? '';
    draw();
    titleInput.focus();
  }

  async function reload(): Promise<void> {
    notes = await window.notesApi.list();
    if (selectedId && !notes.some((n) => n.id === selectedId)) selectedId = null;
    draw();
  }

  $<HTMLButtonElement>('new-note').addEventListener('click', () => {
    select(null);
    setStatus('New note');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = await window.notesApi.save({ id: selectedId ?? undefined, title: titleInput.value, body: bodyInput.value });
    if (result.error || !result.note) {
      setStatus(result.error ?? 'Could not save note.', 'error');
      return;
    }
    selectedId = result.note.id;
    await reload();
    setStatus(`Saved "${result.note.title}"`);
  });

  deleteButton.addEventListener('click', async () => {
    if (!selectedId) return;
    await window.notesApi.remove(selectedId);
    select(null);
    await reload();
    setStatus('Note deleted');
  });

  $<HTMLButtonElement>('import').addEventListener('click', async () => {
    const result = await window.notesApi.importFile();
    if (result.canceled) return setStatus('Import canceled');
    if (result.error) return setStatus(`Import failed: ${result.error}`, 'error');
    await reload();
    setStatus(`Imported ${result.imported} note${result.imported === 1 ? '' : 's'} from ${result.file}${result.skipped ? ` (${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped)` : ''}`);
  });

  $<HTMLButtonElement>('export').addEventListener('click', async () => {
    const result = await window.notesApi.exportFile();
    if (result.canceled) return setStatus('Export canceled');
    if (result.error) return setStatus(`Export failed: ${result.error}`, 'error');
    setStatus(`Exported ${result.exported} note${result.exported === 1 ? '' : 's'} to ${result.file}`);
  });

  search.addEventListener('input', draw);

  void reload().then(() => {
    document.body.dataset.ready = 'true';
    setStatus('Ready');
  });
})();
