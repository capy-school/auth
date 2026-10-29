import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readNotes, writeNotes, maskSecret, NOTES_STORAGE_KEY } from '../src/lib/dashboard-notes.ts';

const legacy = [{ id: 'note-previous', title: 'Existing note', secret: '<opaque>"&', createdAt: '2026-10-25T12:00:00.000Z' }];
function storageWith(value: string | null) {
  let data = value;
  return {
    getItem(key: string) { assert.equal(key, 'secure_notes_data'); return data; },
    setItem(key: string, next: string) { assert.equal(key, 'secure_notes_data'); data = next; },
  };
}

test('keeps the original storage key and restores existing notes unchanged', () => {
  assert.equal(NOTES_STORAGE_KEY, 'secure_notes_data');
  assert.deepEqual(readNotes(storageWith(JSON.stringify(legacy))), legacy);
  assert.deepEqual(readNotes(storageWith(null)), []);
  const older = [{ id: 'old', title: 'Without a timestamp', secret: 'content' }];
  assert.deepEqual(readNotes(storageWith(JSON.stringify(older))), older);
});

test('rejects malformed storage without overwriting the original data', () => {
  for (const value of ['{', '{}', 'null', '[null]', '[{"id":1}]', '[{"id":"x","title":"x","secret":false}]']) {
    const storage = storageWith(value);
    assert.throws(() => readNotes(storage));
    assert.equal(storage.getItem(NOTES_STORAGE_KEY), value);
  }
});

test('surfaces denied storage reads and failed writes instead of pretending success', () => {
  assert.throws(() => readNotes({ getItem() { throw new Error('blocked'); } }));
  assert.throws(() => writeNotes({ setItem() { throw new Error('quota'); } }, legacy));
});

test('writes the legacy format and preserves literal hostile-looking text', () => {
  const storage = storageWith(null);
  writeNotes(storage, legacy);
  assert.deepEqual(readNotes(storage), legacy);
  assert.equal(storage.getItem(NOTES_STORAGE_KEY), JSON.stringify(legacy));
});

test('masks content completely rather than leaking its first or last characters', () => {
  for (const secret of ['x', 'secret', 'a much longer secret value', '🔑é漢字']) {
    assert.equal(maskSecret(secret), '••••••••');
  }
  assert.equal(maskSecret(''), '');
});
