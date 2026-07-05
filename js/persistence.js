export class Persistence {
  constructor(storageKey = 'unified_items') {
    this._storageKey = storageKey;
  }

  load() {
    try {
      const raw = localStorage.getItem(this._storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  save(items) {
    localStorage.setItem(this._storageKey, JSON.stringify(items));
  }

  clear() {
    localStorage.removeItem(this._storageKey);
  }
}
