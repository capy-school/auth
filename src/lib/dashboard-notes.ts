export const NOTES_STORAGE_KEY = 'secure_notes_data';

export interface LocalNote {
  id: string;
  title: string;
  secret: string;
  createdAt?: string;
}

export function readNotes(storage: Pick<Storage, 'getItem'>): LocalNote[] {
  const saved = storage.getItem(NOTES_STORAGE_KEY);
  if (saved === null) return [];
  const notes: unknown = JSON.parse(saved);
  if (!Array.isArray(notes) || !notes.every(note =>
    note !== null && typeof note === 'object' &&
    typeof note.id === 'string' && note.id.length > 0 &&
    typeof note.title === 'string' && typeof note.secret === 'string' &&
    (note.createdAt === undefined || typeof note.createdAt === 'string')
  )) {
    throw new Error('Invalid saved notes');
  }
  return notes;
}

export function writeNotes(storage: Pick<Storage, 'setItem'>, notes: LocalNote[]): void {
  storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
}

export function maskSecret(secret: string): string {
  return secret ? '••••••••' : '';
}
