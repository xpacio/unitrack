import { Store } from './store.js';
import { ItemForm } from './components/itemForm.js';
import { TaskView } from './views/taskView.js';
import { NoteView } from './views/noteView.js';
import { TimelineView } from './views/timelineView.js';
import { FinanzaView } from './views/finanzaView.js';

const store = new Store();

function onSave() {
  currentView?.render();
}

const form = new ItemForm(store, onSave);

let currentView = null;
const views = {};

function init() {
  views.tasks = new TaskView(store, form, showTagResults);
  views.notes = new NoteView(store, form, showTagResults);
  views.timeline = new TimelineView(store, form, showTagResults);
  views.finanzas = new FinanzaView(store, form, showTagResults);

  currentView = views.tasks;

  function onNavClick(view) {
    switchView(view);
  }

  document.querySelectorAll('.nav-btn, .bottom-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => onNavClick(btn.dataset.view));
  });

  document.getElementById('btn-add').addEventListener('click', () => {
    const view = getActiveView();
    const typeMap = { tasks: 'task', notes: 'note', timeline: 'event', finanzas: 'gasto' };
    form.currentType = typeMap[view] || 'task';
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

/* ─── Global Search ─── */
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
  const icon = document.getElementById('sync-icon');
  const pending = document.getElementById('sync-pending');
  const dot = document.getElementById('sync-dot');

  icon.classList.toggle('syncing', status.syncing);
  pending.textContent = status.pendingCount;
  pending.classList.toggle('hidden', status.pendingCount === 0);
  dot.className = 'sync-dot ' + (status.online ? 'online' : 'offline');

  const title = status.syncing ? 'Sincronizando…'
    : !status.online ? 'Sin conexión'
    : status.pendingCount > 0 ? `${status.pendingCount} cambio${status.pendingCount !== 1 ? 's' : ''} pendiente${status.pendingCount !== 1 ? 's' : ''}`
    : 'Todo sincronizado';
  document.getElementById('sync-indicator').title = title;
}

/* ─── Mode detection ─── */
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

/* Auto-detect on resize if no saved preference */
window.matchMedia('(max-width: 640px)').addEventListener('change', (e) => {
  if (!localStorage.getItem('unitrack_mode')) {
    applyMode(e.matches ? 'mobile' : 'desktop');
  }
});

window.addEventListener('sync-status-changed', (e) => updateSyncIndicator(e.detail));

document.addEventListener('DOMContentLoaded', () => {
  init();
  updateSyncIndicator(store.getSyncStatus());
});
