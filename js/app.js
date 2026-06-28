import { Store } from './store.js';
import { Auth } from './auth.js';
import { ItemForm } from './components/itemForm.js';
import { TaskView } from './views/taskView.js';
import { NoteView } from './views/noteView.js';
import { TimelineView } from './views/timelineView.js';
import { FinanzaView } from './views/finanzaView.js';
import * as clipboard from './clipboard.js';

const auth = new Auth();
let store = null;

function onSave() {
  currentView?.render();
}

let form = null;
let currentView = null;
const views = {};

async function initApp() {
  store = new Store({ noSeed: true });
  clipboard.init(store);
  form = new ItemForm(store, onSave);

  views.tasks = new TaskView(store, form, showTagResults);
  views.notes = new NoteView(store, form, showTagResults);
  views.timeline = new TimelineView(store, form, showTagResults);
  views.finanzas = new FinanzaView(store, form, showTagResults);

  currentView = views.tasks;

  document.querySelectorAll('.nav-btn, .bottom-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  const viewDefaultType = { tasks: 'task', notes: 'note', timeline: 'event', finanzas: 'gasto' };
  document.getElementById('btn-add').addEventListener('click', () => {
    form.currentType = viewDefaultType[getActiveView()] || 'task';
    form.parentId = null;
    form.open(null);
  });

  document.getElementById('btn-search')?.addEventListener('click', showGlobalSearch);

  document.getElementById('search-back-btn')?.addEventListener('click', () => {
    document.getElementById('view-search').classList.add('hidden');
    document.getElementById(`view-${_lastViewBeforeSearch}`).classList.remove('hidden');
    document.querySelector(`.nav-btn[data-view="${_lastViewBeforeSearch}"]`)?.classList.add('active');
    document.querySelector(`.bottom-nav-btn[data-view="${_lastViewBeforeSearch}"]`)?.classList.add('active');
    currentView = views[_lastViewBeforeSearch];
    currentView.render();
  });

  let searchTimeout = null;
  document.getElementById('global-search-input')?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const q = e.target.value.trim();
      if (!q) { document.getElementById('search-results').innerHTML = ''; return; }
      renderSearchResults(q);
    }, 200);
  });

  document.getElementById('btn-mode-toggle')?.addEventListener('click', toggleMode);

  document.getElementById('panel-close').addEventListener('click', () => {
    document.getElementById('detail-panel').classList.remove('open');
  });

  document.getElementById('modal-md-close').addEventListener('click', () => {
    document.getElementById('modal-md').classList.remove('open');
  });
  document.getElementById('modal-md').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-md')) {
      document.getElementById('modal-md').classList.remove('open');
    }
  });

  document.getElementById('tag-results').addEventListener('click', (e) => {
    const item = e.target.closest('[data-item-id]');
    if (item) {
      const id = item.dataset.itemId;
      const data = store.getById(id);
      if (!data) return;
      if (data.type === 'task') {
        switchView('tasks');
        views.tasks.openDetail(data);
      } else if (data.type === 'note') {
        switchView('notes');
        views.notes.openDetail(data);
      } else {
        switchView('timeline');
        views.timeline.openDetail(data);
      }
    }
  });

  detectMode();
  window.addEventListener('sync-status-changed', (e) => {
    updateSyncIndicator(e.detail);
    if (!e.detail.syncing && currentView) {
      currentView.render();
    }
  });
  updateSyncIndicator(store.getSyncStatus());

  await store.sync();
  currentView.render();
}

function showApp() {
  document.getElementById('view-auth').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

function showAuth() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('view-auth').classList.remove('hidden');
  document.getElementById('view-reset-pw').classList.add('hidden');
}

function showResetPw() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('view-auth').classList.add('hidden');
  document.getElementById('view-reset-pw').classList.remove('hidden');
}

function getActiveView() {
  const active = document.querySelector('.nav-btn.active');
  return active?.dataset.view || 'tasks';
}

function switchView(view) {
  document.getElementById('tag-results').classList.add('hidden');
  document.querySelectorAll('.nav-btn, .bottom-nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-view="${view}"]`)?.classList.add('active');
  document.querySelector(`.bottom-nav-btn[data-view="${view}"]`)?.classList.add('active');
  document.querySelectorAll('.view-container').forEach(c => c.classList.add('hidden'));
  document.getElementById(`view-${view}`).classList.remove('hidden');
  document.getElementById('detail-panel').classList.remove('open');
  currentView = views[view];
  currentView.render();
}

let _lastViewBeforeSearch = 'tasks';

function showGlobalSearch() {
  const container = document.getElementById('view-search');
  const input = document.getElementById('global-search-input');

  _lastViewBeforeSearch = getActiveView();
  document.querySelectorAll('.view-container').forEach(c => c.classList.add('hidden'));
  container.classList.remove('hidden');
  document.getElementById('detail-panel').classList.remove('open');

  input.value = '';
  document.getElementById('search-results').innerHTML = '';
  setTimeout(() => input.focus(), 100);
}

function renderSearchResults(q) {
  const results = store.search(q);
  if (!results.length) {
    document.getElementById('search-results').innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">Sin resultados</p>';
    return;
  }

  const typeLabels = {
    task: 'Tareas', note: 'Notas', event: 'Eventos',
    suscripcion: 'Suscripciones', gasto: 'Gastos', ahorro: 'Ahorros'
  };
  const typeOrder = ['task', 'note', 'event', 'suscripcion', 'gasto', 'ahorro'];

  const grouped = {};
  for (const item of results) {
    if (!grouped[item.type]) grouped[item.type] = [];
    grouped[item.type].push(item);
  }

  let html = '';
  for (const type of typeOrder) {
    const items = grouped[type];
    if (!items) continue;
    html += `<div style="margin-bottom:20px;">
      <h3 style="font-size:13px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${typeLabels[type] || type} (${items.length})</h3>`;
    for (const item of items) {
      const preview = (item.content || '').replace(/[#*`\[\]]/g, '').trim().slice(0, 80);
      html += `<div class="search-result-item" data-item-id="${item.id}">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:500;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(item.title)}</div>
          ${preview ? `<div style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(preview)}</div>` : ''}
        </div>
        ${item.priority ? `<span class="tree-badge p-${item.priority}">${['Alta','Media','Baja'][item.priority-1]}</span>` : ''}
        ${item.monto ? `<span style="font-size:13px;font-weight:600;flex-shrink:0;">$${Number(item.monto).toLocaleString('es-MX',{minimumFractionDigits:2})}</span>` : ''}
      </div>`;
    }
    html += `</div>`;
  }
  document.getElementById('search-results').innerHTML = html;

  document.querySelectorAll('.search-result-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.itemId;
      const item = store.getById(id);
      if (!item) return;

      const viewMap = {
        task: 'tasks', note: 'notes', event: 'timeline',
        suscripcion: 'finanzas', gasto: 'finanzas', ahorro: 'finanzas'
      };
      const view = viewMap[item.type] || 'tasks';

      document.getElementById('view-search').classList.add('hidden');
      switchView(view);

      const viewObj = views[view];
      if (viewObj && typeof viewObj.openDetail === 'function') {
        viewObj.openDetail(item);
      }
    });
  });
}

function escHtml(s) {
  if (typeof s !== 'string') return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function showTagResults(tag) {
  const items = store.getByTag(tag);
  const container = document.getElementById('tag-results');

  container.innerHTML = `
    <div style="max-width:560px;margin:0 auto;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <button class="btn btn-secondary" id="tag-back-btn" style="font-size:12px;">← Volver</button>
        <h2 style="font-size:16px;font-weight:600;">Tag: <span class="tag">${escHtml(tag)}</span></h2>
        <span style="font-size:12px;color:var(--text-secondary);">${items.length} resultado${items.length !== 1 ? 's' : ''}</span>
      </div>
      ${items.length === 0
        ? '<p style="color:var(--text-muted);text-align:center;padding:40px;">Sin resultados</p>'
        : items.map(item => renderTagResult(item)).join('')}
    </div>
  `;

  container.querySelector('#tag-back-btn')?.addEventListener('click', () => {
    container.classList.add('hidden');
    const active = getActiveView();
    document.getElementById(`view-${active}`).classList.remove('hidden');
    currentView.render();
  });

  document.querySelectorAll('.view-container').forEach(c => c.classList.add('hidden'));
  container.classList.remove('hidden');

  function renderTagResult(item) {
    const preview = (item.content || '').replace(/[#*`\[\]]/g, '').trim().slice(0, 100);
    return `
      <div class="tag-result-item" data-item-id="${item.id}">
        <span class="type-badge ${item.type}">${item.type === 'task' ? 'Tarea' : item.type === 'note' ? 'Nota' : 'Evento'}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:500;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(item.title)}</div>
          ${preview ? `<div style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(preview)}</div>` : ''}
        </div>
        ${item.priority ? `<span class="tree-badge p-${item.priority}">${['Alta','Media','Baja'][item.priority-1]}</span>` : ''}
      </div>
    `;
  }

}

function updateSyncIndicator(status) {
  const indicator = document.getElementById('sync-dots');
  const pending = document.getElementById('sync-pending');

  pending.textContent = status.pendingCount;
  pending.classList.toggle('hidden', status.pendingCount === 0);

  indicator.classList.remove('status-green', 'status-yellow', 'status-red', 'status-blue', 'status-indicator-animated');

  if (status.syncing) {
    indicator.classList.add('status-blue', 'status-indicator-animated');
  } else if (!status.online) {
    indicator.classList.add('status-red');
  } else if (status.pendingCount > 0) {
    indicator.classList.add('status-yellow', 'status-indicator-animated');
  } else {
    indicator.classList.add('status-green', 'status-indicator-animated');
  }

  const title = status.syncing ? 'Sincronizando…'
    : !status.online ? 'Sin conexión'
    : status.pendingCount > 0 ? `${status.pendingCount} cambio${status.pendingCount !== 1 ? 's' : ''} pendiente${status.pendingCount !== 1 ? 's' : ''}`
    : 'Todo sincronizado';
  document.getElementById('sync-indicator').title = title;
}

function detectMode() {
  const saved = localStorage.getItem('unitrack_mode');
  if (saved === 'mobile' || saved === 'desktop') {
    applyMode(saved);
    return;
  }
  const auto = window.matchMedia('(max-width: 640px)').matches ? 'mobile' : 'desktop';
  applyMode(auto);
}

function applyMode(mode) {
  const isMobile = mode === 'mobile';
  document.body.classList.toggle('mode-mobile', isMobile);
  localStorage.setItem('unitrack_mode', mode);
  const toggleBtn = document.getElementById('btn-mode-toggle');
  if (toggleBtn) {
    toggleBtn.classList.toggle('active', isMobile);
    toggleBtn.title = isMobile ? 'Modo móvil - Haz clic para cambiar a escritorio' : 'Modo escritorio - Haz clic para cambiar a móvil';
  }
  if (currentView && typeof currentView.render === 'function') {
    currentView.render();
  }
}

function toggleMode() {
  const next = document.body.classList.contains('mode-mobile') ? 'desktop' : 'mobile';
  applyMode(next);
}

window.matchMedia('(max-width: 640px)').addEventListener('change', (e) => {
  if (!localStorage.getItem('unitrack_mode')) {
    applyMode(e.matches ? 'mobile' : 'desktop');
  }
});

function initAuth() {
  const loginForm = document.getElementById('auth-login');
  const registerForm = document.getElementById('auth-register');
  const loginError = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.authTab;
      document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
      document.getElementById(`auth-${target}`).classList.remove('hidden');
      loginError.textContent = '';
      registerError.textContent = '';
    });
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    try {
      await auth.login(email, password);
      await onAuthenticated();
    } catch (err) {
      loginError.textContent = err.message;
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerError.textContent = '';
    const nombre = document.getElementById('register-nombre').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    try {
      await auth.register(email, password, nombre);
      await onAuthenticated();
    } catch (err) {
      registerError.textContent = err.message;
    }
  });

  document.getElementById('btn-user')?.addEventListener('click', () => {
    const avatar = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-name');
    const emailEl = document.getElementById('user-email');
    const name = auth.user?.nombre || auth.user?.email || 'Usuario';
    avatar.textContent = name.charAt(0).toUpperCase();
    nameEl.textContent = name;
    emailEl.textContent = auth.user?.email || '';
    document.getElementById('modal-user').classList.add('open');
  });

  document.getElementById('modal-user-close').addEventListener('click', () => {
    document.getElementById('modal-user').classList.remove('open');
  });
  document.getElementById('modal-user').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-user')) {
      document.getElementById('modal-user').classList.remove('open');
    }
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    document.getElementById('modal-user').classList.remove('open');
    store?.destroy();
    localStorage.clear();
    store = null;
    try {
      await auth.logout();
    } catch {}
    showAuth();
  });

  document.getElementById('btn-reset-user')?.addEventListener('click', async () => {
    document.getElementById('modal-user').classList.remove('open');
    if (!confirm('¿Restablecer UniTrack? Se borrarán todos los datos locales y se cerrará tu sesión.')) return;
    await resetApp();
    location.reload();
  });

  const pwDisplay = document.getElementById('new-pw-display');
  const pwModal = document.getElementById('modal-change-pw');

  function generarPassword(len = 10) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let pwd = '';
    for (let i = 0; i < len; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }

  document.getElementById('btn-change-pw')?.addEventListener('click', () => {
    pwDisplay.textContent = generarPassword();
    pwModal.classList.add('open');
  });

  document.getElementById('modal-change-pw-close')?.addEventListener('click', () => {
    pwModal.classList.remove('open');
  });
  pwModal?.addEventListener('click', (e) => {
    if (e.target === pwModal) pwModal.classList.remove('open');
  });

  document.getElementById('btn-gen-pw')?.addEventListener('click', () => {
    pwDisplay.textContent = generarPassword();
  });

  document.getElementById('btn-save-pw')?.addEventListener('click', async () => {
    const newPassword = pwDisplay.textContent;
    if (!newPassword || newPassword.length < 6) {
      alert('La clave debe tener al menos 6 caracteres.');
      return;
    }
    try {
      await auth.changePassword(newPassword);
      pwModal.classList.remove('open');
      document.getElementById('modal-user').classList.remove('open');
      store?.destroy();
      localStorage.clear();
      store = null;
      showAuth();
      alert('Clave cambiada. Inicia sesión con tu nueva clave.');
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('btn-cancel-pw')?.addEventListener('click', () => {
    pwModal.classList.remove('open');
  });

  const forgotSection = document.getElementById('forgot-section');
  const forgotEmail = document.getElementById('forgot-email');
  const forgotError = document.getElementById('forgot-error');
  const forgotOk = document.getElementById('forgot-ok');

  document.getElementById('btn-forgot-pw')?.addEventListener('click', (e) => {
    e.preventDefault();
    forgotSection.classList.toggle('hidden');
    if (!forgotSection.classList.contains('hidden')) {
      forgotEmail.value = '';
      forgotError.textContent = '';
      forgotOk.classList.add('hidden');
      forgotEmail.focus();
    }
  });

  document.getElementById('btn-forgot-send')?.addEventListener('click', async () => {
    const email = forgotEmail.value.trim();
    if (!email) {
      forgotError.textContent = 'Ingresa tu email';
      return;
    }
    forgotError.textContent = '';
    const btn = document.getElementById('btn-forgot-send');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
      const res = await fetch('/api/auth.php?action=forgot_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.status === 429 && data.retry_after) {
        let secs = data.retry_after;
        forgotError.textContent = `Espera ${secs}s antes de reintentar`;
        const iv = setInterval(() => {
          secs--;
          if (secs <= 0) {
            clearInterval(iv);
            forgotError.textContent = '';
            btn.disabled = false;
            btn.textContent = 'Enviar nueva clave';
          } else {
            forgotError.textContent = `Espera ${secs}s antes de reintentar`;
          }
        }, 1000);
      } else {
        forgotOk.classList.remove('hidden');
        forgotEmail.value = '';
        btn.disabled = false;
        btn.textContent = 'Enviar nueva clave';
      }
    } catch {
      forgotError.textContent = 'Error de conexión';
      btn.disabled = false;
      btn.textContent = 'Enviar nueva clave';
    }
  });
}

async function onAuthenticated() {
  showApp();
  if (store) {
    store.clear();
  }
  localStorage.removeItem('unified_items');
  if (!store) {
    await initApp();
  } else {
    await store.sync();
    currentView?.render();
  }
}

async function resetApp() {
  localStorage.clear();
  if (store) {
    store.destroy();
    store.items = [];
    store._lastSyncAt = 0;
    store._pendingCount = 0;
    store.save();
  }
  await auth.logout();
  showAuth();
}

document.getElementById('btn-reset')?.addEventListener('click', async (e) => {
  e.preventDefault();
  if (!confirm('¿Restablecer UniTrack? Se borrarán todos los datos locales y se cerrará tu sesión.')) return;
  await resetApp();
  location.reload();
});

window.addEventListener('auth-required', async () => {
  store?.destroy();
  store?.clear();
  await auth.logout();
  showAuth();
});

function escAttr(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function handleResetToken(token) {
  showResetPw();
  const body = document.getElementById('reset-pw-body');
  body.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Verificando token...</p>';
  try {
    const res = await fetch('/api/auth.php?action=verify_reset_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!res.ok) {
      body.innerHTML = `
        <div style="text-align:center;">
          <div style="font-size:40px;margin-bottom:12px;">🔗</div>
          <p style="color:var(--danger);font-weight:500;">${escAttr(data.error || 'Token inválido')}</p>
          <p style="font-size:13px;color:var(--text-muted);margin-top:8px;">
            <a href="/" style="color:var(--primary);">Volver al inicio</a>
          </p>
        </div>`;
      return;
    }
    const nombre = escAttr(data.user.nombre || data.user.email);
    body.innerHTML = `
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:14px;color:var(--text-secondary);">Hola <strong>${nombre}</strong>, ingresa tu nueva clave</div>
      </div>
      <div class="auth-field" style="margin-bottom:8px;">
        <label for="reset-password">Nueva contraseña</label>
        <input type="password" id="reset-password" placeholder="Mínimo 6 caracteres" autocomplete="new-password" required>
      </div>
      <div class="auth-error" id="reset-error"></div>
      <button class="auth-btn" id="btn-reset-save" style="margin-top:4px;">Guardar nueva clave</button>
      <div style="text-align:center;margin-top:8px;">
        <a href="/" style="font-size:12px;color:var(--text-muted);">Cancelar</a>
      </div>`;

    document.getElementById('btn-reset-save')?.addEventListener('click', async () => {
      const pw = document.getElementById('reset-password').value;
      const errEl = document.getElementById('reset-error');
      if (!pw || pw.length < 6) {
        errEl.textContent = 'Mínimo 6 caracteres';
        return;
      }
      errEl.textContent = '';
      document.getElementById('btn-reset-save').disabled = true;
      try {
        const r2 = await fetch('/api/auth.php?action=reset_password_with_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, new_password: pw }),
        });
        const d2 = await r2.json();
        if (!r2.ok) {
          errEl.textContent = d2.error || 'Error';
          document.getElementById('btn-reset-save').disabled = false;
          return;
        }
        history.replaceState(null, '', '/');
        showAuth();
        alert('Clave actualizada. Inicia sesión con tu nueva clave.');
      } catch {
        errEl.textContent = 'Error de conexión';
        document.getElementById('btn-reset-save').disabled = false;
      }
    });
  } catch {
    body.innerHTML = `
      <div style="text-align:center;">
        <p style="color:var(--danger);font-weight:500;">Error de conexión</p>
        <p style="font-size:13px;color:var(--text-muted);margin-top:8px;">
          <a href="/" style="color:var(--primary);">Volver al inicio</a>
        </p>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get('reset_token');

  if (resetToken) {
    initAuth();
    await handleResetToken(resetToken);
    return;
  }

  initAuth();
  const user = await auth.checkSession();
  if (user) {
    try {
      await onAuthenticated();
    } catch (err) {
      console.error('Error al iniciar app:', err);
      resetApp();
    }
  } else {
    showAuth();
  }
});
