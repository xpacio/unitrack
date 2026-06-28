export class Auth {
  constructor() {
    this.user = null;
    this._listeners = [];
    this._authUrl = '/api/auth.php';
  }

  onAuthChange(callback) {
    this._listeners.push(callback);
  }

  _notify() {
    for (const cb of this._listeners) {
      cb(this.user);
    }
  }

  isAuthenticated() {
    return !!this.user;
  }

  async checkSession() {
    try {
      const res = await fetch(`${this._authUrl}?action=me`, {
        credentials: 'include',
      });
      if (!res.ok) {
        this.user = null;
        this._notify();
        return null;
      }
      const data = await res.json();
      this.user = data.user;
      this._notify();
      return this.user;
    } catch {
      this.user = null;
      this._notify();
      return null;
    }
  }

  async login(email, password) {
    const res = await fetch(`${this._authUrl}?action=login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión');
    this.user = data.user;
    this._notify();
    return this.user;
  }

  async register(email, password, nombre) {
    const res = await fetch(`${this._authUrl}?action=register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, nombre }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al registrar');
    this.user = data.user;
    this._notify();
    return this.user;
  }

  async changePassword(newPassword) {
    const res = await fetch(`${this._authUrl}?action=change_password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ new_password: newPassword }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al cambiar contraseña');
    this.user = null;
    this._notify();
    return data;
  }

  async logout() {
    try {
      await fetch(`${this._authUrl}?action=logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // silent
    }
    this.user = null;
    this._notify();
  }
}
