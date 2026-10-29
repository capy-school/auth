import { readNotes, writeNotes, maskSecret, type LocalNote } from '../../lib/dashboard-notes';

export function mountNotes(root: HTMLElement, getStorage: () => Storage = () => window.localStorage): void {
  const form = root.querySelector<HTMLFormElement>('[data-notes-form]')!;
  const fields = root.querySelector<HTMLFieldSetElement>('[data-notes-fields]')!;
  const title = root.querySelector<HTMLInputElement>('#noteTitle')!;
  const content = root.querySelector<HTMLTextAreaElement>('#noteSecret')!;
  const empty = root.querySelector<HTMLElement>('[data-notes-empty]')!;
  const list = root.querySelector<HTMLUListElement>('[data-notes-list]')!;
  const error = root.querySelector<HTMLElement>('[data-notes-error]')!;
  const status = root.querySelector<HTMLElement>('[data-notes-status]')!;
  const retry = root.querySelector<HTMLButtonElement>('[data-notes-retry]')!;
  let notes: LocalNote[] = [];
  let storage: Storage;

  function fail(message: string) {
    status.textContent = '';
    error.textContent = message;
    error.hidden = false;
  }

  function save(change: (current: LocalNote[]) => LocalNote[], message: string): boolean {
    try {
      // Re-read before a mutation so notes saved since page load are retained.
      const next = change(readNotes(storage));
      writeNotes(storage, next);
      notes = next;
      render();
      error.hidden = true;
      status.textContent = message;
      return true;
    } catch {
      fail('No se han guardado los cambios. Revisa el espacio y los permisos de almacenamiento del navegador.');
      return false;
    }
  }

  function render() {
    const items = notes.map(note => {
      const item = document.createElement('li');
      item.className = 'local-note';
      const heading = document.createElement('h3');
      heading.textContent = note.title;
      const secret = document.createElement('code');
      secret.className = 'local-note-content';
      secret.textContent = maskSecret(note.secret);
      const actions = document.createElement('div');
      actions.className = 'local-note-actions';
      const reveal = document.createElement('button');
      reveal.type = 'button';
      reveal.textContent = 'Mostrar';
      reveal.setAttribute('aria-label', `Mostrar contenido de ${note.title}`);
      reveal.setAttribute('aria-pressed', 'false');
      reveal.addEventListener('click', () => {
        const shown = reveal.getAttribute('aria-pressed') === 'true';
        secret.textContent = shown ? maskSecret(note.secret) : note.secret;
        reveal.textContent = shown ? 'Mostrar' : 'Ocultar';
        reveal.setAttribute('aria-label', `${shown ? 'Mostrar' : 'Ocultar'} contenido de ${note.title}`);
        reveal.setAttribute('aria-pressed', String(!shown));
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'local-note-delete';
      remove.textContent = 'Eliminar';
      remove.setAttribute('aria-label', `Eliminar nota ${note.title}`);
      remove.addEventListener('click', () => {
        if (!window.confirm('¿Eliminar esta nota de este navegador? No se puede deshacer.')) return;
        if (save(current => current.filter(candidate => candidate.id !== note.id), 'Nota eliminada.')) title.focus();
      });
      actions.append(reveal, remove);
      item.append(heading, secret, actions);
      return item;
    });
    list.replaceChildren(...items);
    list.hidden = notes.length === 0;
    empty.hidden = notes.length !== 0;
  }

  function load() {
    try {
      storage = getStorage();
      notes = readNotes(storage);
      render();
      fields.disabled = false;
      error.hidden = true;
      retry.hidden = true;
      status.textContent = '';
    } catch {
      fields.disabled = true;
      empty.hidden = true;
      list.hidden = true;
      retry.hidden = false;
      fail('No se pueden leer las notas guardadas. No se han sobrescrito. Revisa los permisos del navegador y vuelve a intentar.');
    }
    root.dataset.notesReady = 'true';
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const noteTitle = title.value.trim();
    const noteContent = content.value.trim();
    if (!noteTitle || !noteContent) {
      fail('Escribe un título y un contenido para la nota.');
      (!noteTitle ? title : content).focus();
      return;
    }
    const note = { id: `note-${crypto.randomUUID()}`, title: noteTitle, secret: noteContent, createdAt: new Date().toISOString() };
    if (save(current => [note, ...current], 'Nota guardada solo en este navegador.')) {
      form.reset();
      title.focus();
    }
  });
  retry.addEventListener('click', load);
  load();
}
