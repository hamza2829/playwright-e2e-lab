/**
 * Pure import/export logic for the Lab Notes desktop app.
 * Kept free of Electron imports so it can be unit tested with plain Node.
 */

export interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
}

export interface NoteInput {
  title: string;
  body: string;
}

export const EXPORT_VERSION = 1;
export const MAX_TITLE_LENGTH = 200;
export const MAX_IMPORT_NOTES = 1000;

export type ParseResult = { notes: NoteInput[] } | { error: string };

export function parseImport(text: string, extension: string): ParseResult {
  const ext = extension.toLowerCase().replace(/^\./, '');
  if (ext === 'json') return parseJson(text);
  if (ext === 'md' || ext === 'markdown') return parseMarkdown(text);
  return { error: `Unsupported file type ".${ext}". Use .json or .md files.` };
}

function parseJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'File is not valid JSON.' };
  }
  const items = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.notes) ? data.notes : null;
  if (!items) return { error: 'JSON must be an array of notes or an object with a "notes" array.' };
  const notes: NoteInput[] = [];
  for (const [index, item] of items.entries()) {
    if (!isRecord(item) || typeof item.title !== 'string' || item.title.trim() === '') {
      return { error: `Note ${index + 1} is missing a title.` };
    }
    if (item.body !== undefined && typeof item.body !== 'string') {
      return { error: `Note ${index + 1} has a body that is not text.` };
    }
    notes.push(normalise({ title: item.title, body: (item.body as string | undefined) ?? '' }));
  }
  return finalise(notes);
}

function parseMarkdown(text: string): ParseResult {
  const notes: NoteInput[] = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const heading = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      if (current) notes.push(normalise({ title: current.title, body: current.lines.join('\n') }));
      current = { title: heading[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) notes.push(normalise({ title: current.title, body: current.lines.join('\n') }));
  return finalise(notes);
}

function finalise(notes: NoteInput[]): ParseResult {
  if (notes.length === 0) return { error: 'No notes found in file.' };
  if (notes.length > MAX_IMPORT_NOTES) return { error: `Too many notes (${notes.length}). The limit is ${MAX_IMPORT_NOTES}.` };
  return { notes };
}

function normalise(note: NoteInput): NoteInput {
  return { title: note.title.trim().slice(0, MAX_TITLE_LENGTH), body: note.body.trim() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Adds incoming notes, skipping exact duplicates (same title and body) of existing ones. */
export function mergeNotes(existing: Note[], incoming: NoteInput[], makeId: () => string, now = new Date()) {
  const seen = new Set(existing.map((n) => `${n.title}\u0000${n.body}`));
  const notes = [...existing];
  let imported = 0;
  let skipped = 0;
  for (const input of incoming) {
    const key = `${input.title}\u0000${input.body}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    notes.push({ id: makeId(), title: input.title, body: input.body, updatedAt: now.toISOString() });
    imported++;
  }
  return { notes, imported, skipped };
}

export function serializeExport(notes: Note[], now = new Date()): string {
  return `${JSON.stringify(
    {
      app: 'lab-notes',
      version: EXPORT_VERSION,
      exportedAt: now.toISOString(),
      notes: notes.map(({ title, body, updatedAt }) => ({ title, body, updatedAt })),
    },
    null,
    2,
  )}\n`;
}
