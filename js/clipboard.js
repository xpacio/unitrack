let _cutIds = [];
let _store = null;

export function init(store) {
  _store = store;
  document.getElementById('cut-clear')?.addEventListener('click', clearCut);
}

export function cutItem(id) {
  _cutIds.push(id);
  updateIndicator();
  showToast(`✂ Elemento cortado (${_cutIds.length} en total)`);
}

export function pasteAll(parentId) {
  if (_cutIds.length === 0) return 0;
  let ok = 0, errors = [];
  for (const id of _cutIds) {
    try {
      _store.reparent(id, parentId);
      ok++;
    } catch (e) {
      errors.push(e.message);
    }
  }
  const parentTitle = _store.getById(parentId)?.title || '?';
  _cutIds = [];
  updateIndicator();
  showToast(`📄 ${ok} elemento${ok !== 1 ? 's' : ''} pegado${ok !== 1 ? 's' : ''} como hijo${ok !== 1 ? 's' : ''} de "${parentTitle}"`);
  if (errors.length) {
    setTimeout(() => showToast(`Error: ${errors.join('. ')}`, 5000), 3000);
  }
  return ok;
}

export function clearCut() {
  _cutIds = [];
  updateIndicator();
}

export function getCutIds() {
  return [..._cutIds];
}

export function getCutCount() {
  return _cutIds.length;
}

function updateIndicator() {
  const bar = document.getElementById('clipboard-bar');
  const countEl = document.getElementById('cut-count');
  if (!bar || !countEl) return;
  if (_cutIds.length > 0) {
    countEl.textContent = _cutIds.length;
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

let _toastTimeout = null;

export function showToast(msg, duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-fade');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
