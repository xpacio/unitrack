import { Store } from './store.js';
import { ItemForm } from './components/itemForm.js';
import { TaskView } from './views/taskView.js';
import { NoteView } from './views/noteView.js';
import { TimelineView } from './views/timelineView.js';

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

  currentView = views.tasks;

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });

  document.getElementById('btn-add').addEventListener('click', () => {
    const view = getActiveView();
    form.currentType = view === 'notes' ? 'note' : view === 'timeline' ? 'event' : 'task';
    form.parentId = null;
    form.open(null);
  });

  document.getElementById('btn-search')?.addEventListener('click', () => {
    const active = getActiveView();
    const container = document.getElementById(`view-${active}`);
    const searchInput = container?.querySelector('.search-bar input');
    if (searchInput) searchInput.focus();
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
}

function getActiveView() {
  const active = document.querySelector('.nav-btn.active');
  return active?.dataset.view || 'tasks';
}

function switchView(view) {
  document.getElementById('tag-results').classList.add('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-view="${view}"]`).classList.add('active');
  document.querySelectorAll('.view-container').forEach(c => c.classList.add('hidden'));
  document.getElementById(`view-${view}`).classList.remove('hidden');
  document.getElementById('detail-panel').classList.remove('open');
  currentView = views[view];
  currentView.render();
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

  function escHtml(s) {
    if (typeof s !== 'string') return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', init);
