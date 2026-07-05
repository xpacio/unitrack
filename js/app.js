import { Store } from './store.js';
import { Auth } from './auth.js';
import { ItemForm } from './components/itemForm.js';
import { TaskView } from './views/taskView.js';
import { NoteView } from './views/noteView.js';
import { TimelineView } from './views/timelineView.js';
import { FinanzaView } from './views/finanzaView.js';
import { esc } from './helpers.js';
import * as clipboard from './clipboard.js';
import { initAuthUI } from './authUI.js';

const auth = new Auth();
let store = null;

function onSave() {
  currentView?.render();
}

let form = null;
let currentView = null;
const views = {};

async function initApp() {
  store = new Store({ noSeed: true, getCsrfToken: () => auth.getCsrfToken() });
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

  initDisplayMode();
  window.addEventListener('sync-status-changed', (e) => {
    updateBrandStatus(e.detail);
    if (!e.detail.syncing && currentView) {
      currentView.render();
    }
  });
  updateBrandStatus(store.getSyncStatus());

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
  currentView?.setActive?.(false);
  currentView = views[view];
  currentView.setActive?.(true);
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
          <div style="font-weight:500;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(item.title)}</div>
          ${preview ? `<div style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(preview)}</div>` : ''}
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

function showTagResults(tag) {
  const items = store.getByTag(tag);
  const container = document.getElementById('tag-results');

  container.innerHTML = `
    <div style="max-width:560px;margin:0 auto;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <button class="btn btn-secondary" id="tag-back-btn" style="font-size:12px;">← Volver</button>
        <h2 style="font-size:16px;font-weight:600;">Tag: <span class="tag">${esc(tag)}</span></h2>
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
          <div style="font-weight:500;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(item.title)}</div>
          ${preview ? `<div style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(preview)}</div>` : ''}
        </div>
        ${item.priority ? `<span class="tree-badge p-${item.priority}">${['Alta','Media','Baja'][item.priority-1]}</span>` : ''}
      </div>
    `;
  }

}

function updateBrandStatus(status) {
  const brand = document.getElementById('brand');
  const badge = document.getElementById('brand-badge');
  if (!brand) return;

  brand.className = 'brand';
  badge?.classList.add('hidden');

  if (status.syncing) {
    brand.classList.add('status-syncing');
  } else if (!status.online) {
    brand.classList.add('status-offline');
  } else if (status.pendingCount > 0) {
    badge.textContent = status.pendingCount;
    badge.classList.remove('hidden');
  }

  const title = status.syncing ? 'Sincronizando…'
    : !status.online ? 'Sin conexión'
    : status.pendingCount > 0 ? `${status.pendingCount} cambio${status.pendingCount !== 1 ? 's' : ''} pendiente${status.pendingCount !== 1 ? 's' : ''}`
    : 'Todo sincronizado';
  brand.title = title;
}

function initDisplayMode() {
  const saved = localStorage.getItem('unitrack_mode');
  if (saved === 'mobile' || saved === 'desktop') {
    applyModeInternal(saved);
  } else {
    const auto = window.matchMedia('(max-width: 640px)').matches ? 'mobile' : 'desktop';
    applyModeInternal(auto);
  }
}

function applyModeInternal(mode) {
  const isMobile = mode === 'mobile';
  document.body.classList.toggle('mode-mobile', isMobile);
  if (currentView && typeof currentView.render === 'function') {
    currentView.render();
  }
}

window.matchMedia('(max-width: 640px)').addEventListener('change', (e) => {
  if (!localStorage.getItem('unitrack_mode')) {
    applyModeInternal(e.matches ? 'mobile' : 'desktop');
  }
});

function initUserModalSettings() {
  const savedMode = localStorage.getItem('unitrack_mode');
  const displayMode = savedMode === 'mobile' || savedMode === 'desktop' ? savedMode : 'auto';
  const dm = document.querySelector('input[name="display-mode"][value="' + displayMode + '"]');
  if (dm) dm.checked = true;
}

function setDisplayMode(mode) {
  if (mode === 'auto') {
    localStorage.removeItem('unitrack_mode');
    const auto = window.matchMedia('(max-width: 640px)').matches ? 'mobile' : 'desktop';
    applyModeInternal(auto);
  } else {
    localStorage.setItem('unitrack_mode', mode);
    applyModeInternal(mode);
  }
}

document.querySelectorAll('input[name="display-mode"]').forEach(el => {
  el.addEventListener('change', (e) => {
    if (e.target.checked) setDisplayMode(e.target.value);
  });
});

function initAppRef() {
  const app = {
    store,
    showAuth,
    onAuthenticated,
    resetApp,
    initUserModalSettings,
  };
  initAuthUI(auth, app);
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
  document.getElementById('detail-panel')?.classList.remove('open');
  document.querySelectorAll('.modal-overlay.open').forEach(el => el.classList.remove('open'));
  document.getElementById('tag-results')?.classList.add('hidden');
  await auth.logout();
  showAuth();
});

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
    initAppRef();
    await handleResetToken(resetToken);
    return;
  }

  initAppRef();
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
