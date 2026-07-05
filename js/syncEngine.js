export class SyncEngine {
  constructor(options = {}) {
    this._syncUrl = options.syncUrl || '/api/sync.php';
    this._getCsrfToken = options.getCsrfToken || (() => '');
  }

  async sync(payload, lastSyncAt) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this._getCsrfToken();
    if (token) headers['X-CSRF-Token'] = token;

    const res = await fetch(this._syncUrl, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ items: payload, lastSync: lastSyncAt }),
    });

    if (!res.ok) {
      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent('auth-required'));
      }
      return null;
    }

    const data = await res.json();
    return data;
  }
}
