import { Store, createItem } from './store.js';
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
  views.tasks = new TaskView(store, form);
  views.notes = new NoteView(store, form);
  views.timeline = new TimelineView(store, form);

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
}

function getActiveView() {
  const active = document.querySelector('.nav-btn.active');
  return active?.dataset.view || 'tasks';
}

function switchView(view) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-view="${view}"]`).classList.add('active');

  document.querySelectorAll('.view-container').forEach(c => c.classList.add('hidden'));
  document.getElementById(`view-${view}`).classList.remove('hidden');

  document.getElementById('detail-panel').classList.remove('open');

  currentView = views[view];
  currentView.render();
}

document.addEventListener('DOMContentLoaded', init);
