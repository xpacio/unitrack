import * as clipboard from '../clipboard.js';
import { esc, renderMarkdown, getTypeIcon } from '../helpers.js';
import { TreeRenderer } from '../treeRenderer.js';

export class NoteView {
  constructor(store, form, onTagClick) {
    this.store = store;
    this.form = form;
    this.onTagClick = onTagClick;
    this.container = document.getElementById('view-notes');
    this.tree = new TreeRenderer(store);
    this.render();
  }

  render() {
    const all = [...this.store.getByType('carpeta'), ...this.store.getByType('note')];
    this.container.innerHTML = `
      <div class="tree-root" id="note-tree">
        ${this.tree.render(null, 0, (item, depth, isExpanded, hasChildren) => this.renderRow(item, depth, isExpanded, hasChildren))}
      </div>
      ${all.length === 0 ? this.emptyState() : ''}
    `;
    this.attachEvents();
  }

  renderRow(item, depth, isExpanded, hasChildren) {
    if (item.type === 'carpeta') {
      const childCount = this.store.getChildren(item.id).length;
      const tags = item.tags?.length
        ? item.tags.map(t => `<span class="tree-badge tag-clickable" data-tag="${esc(t)}" style="background:var(--primary-light);color:var(--primary);cursor:pointer;">${esc(t)}</span>`).join('')
        : '';

      return `
        <div class="tree-row folder" data-id="${item.id}" style="--tree-depth:${depth}">
          <div class="tree-row-body" data-id="${item.id}">
            <span class="tree-folder-icon">📁</span>
            <span class="tree-title">${esc(item.title)}</span>
            ${tags}
            <span class="tree-count-badge">${childCount}</span>
          </div>
          <span class="tree-toggle${isExpanded ? ' expanded' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          </span>
        </div>`;
    }

    const preview = (item.content || '').replace(/[#*`\[\]]/g, '').trim().slice(0, 60);

    return `
      <div class="tree-row" data-id="${item.id}" style="--tree-depth:${depth}">
        <div class="tree-row-body" data-id="${item.id}">
          <span class="tree-type-icon">${getTypeIcon(item.type)}</span>
          <span class="tree-title">${esc(item.title)}</span>
          ${preview ? `<span class="tree-preview">— ${esc(preview)}</span>` : ''}
        </div>
        <span class="tree-actions">
          <button class="tree-action" data-action="add-sub" data-id="${item.id}" title="Agregar sub-nota">+</button>
          <button class="tree-action danger" data-action="delete" data-id="${item.id}" title="Eliminar">✕</button>
        </span>
        <span class="tree-toggle${isExpanded ? ' expanded' : ''}${!hasChildren ? ' leaf' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </span>
      </div>`;
  }

  attachEvents() {
    const tree = this.container.querySelector('#note-tree');
    if (!tree) return;

    this.tree.setupToggle(tree);

    tree.addEventListener('click', (e) => {
      const toggle = e.target.closest('.tree-toggle:not(.leaf)');
      if (toggle) return;

      const tag = e.target.closest('.tag-clickable');
      if (tag && this.onTagClick) {
        this.onTagClick(tag.dataset.tag);
        return;
      }

      const body = e.target.closest('.tree-row-body');
      if (body) {
        const row = body.closest('.tree-row');
        const item = this.store.getById(row.dataset.id);
        if (item) this.openDetail(item);
        return;
      }

      const action = e.target.closest('[data-action]');
      if (!action) return;
      if (action.dataset.action === 'add-sub') {
        this.form.currentType = 'note';
        this.form.parentId = action.dataset.id;
        this.form.open(null);
      } else if (action.dataset.action === 'delete') {
        if (confirm('¿Eliminar esta nota y sus sub-notas?')) {
          this.store.delete(action.dataset.id);
          this.render();
        }
      }
    });
  }

  openDetail(item) {
    const panel = document.getElementById('detail-panel');
    const body = document.getElementById('panel-body');
    const title = document.getElementById('panel-title');
    const actions = document.getElementById('panel-actions');

    if (item.type === 'carpeta') {
      this.openFolderDetail(item, panel, body, title, actions);
      return;
    }

    title.textContent = 'Nota';
    body.innerHTML = this.renderView(item);
    const pegCnt = clipboard.getCutCount();
    actions.innerHTML = `
      <button class="btn btn-secondary" id="note-detail-edit">✎ Editar</button>
      <button class="btn btn-danger" id="note-detail-delete">🗑 Eliminar</button>
      ${pegCnt > 0 ? `<button class="btn btn-secondary" id="note-detail-paste">📄 Pegar ${pegCnt}</button>` : ''}
    `;
    panel.classList.add('open');

    body.querySelectorAll('.tag-clickable').forEach(el => {
      el.addEventListener('click', () => {
        if (this.onTagClick) this.onTagClick(el.dataset.tag);
      });
    });

    actions.querySelector('#note-detail-edit').addEventListener('click', () => {
      body.innerHTML = this.renderEdit(item);
      actions.innerHTML = `
        <button class="btn btn-primary" id="note-edit-save">Guardar</button>
        <button class="btn btn-secondary" id="note-edit-cancel">Cancelar</button>
        <div style="flex:1"></div>
        <button class="btn btn-secondary" id="note-edit-cut">✂ Cortar</button>
      `;
      this.attachEditEvents(item);
    });

    actions.querySelector('#note-detail-delete').addEventListener('click', () => {
      if (confirm('¿Eliminar esta nota?')) {
        this.store.delete(item.id);
        panel.classList.remove('open');
        this.render();
      }
    });

    actions.querySelector('#note-detail-paste')?.addEventListener('click', () => {
      if (clipboard.getCutCount() === 0) return;
      clipboard.pasteAll(item.id);
      document.getElementById('detail-panel').classList.remove('open');
      this.render();
    });
  }

  openFolderDetail(item, panel, body, title, actions) {
    title.textContent = esc(item.title);

    const children = this.store.getChildren(item.id);

    body.innerHTML = `
      <div class="panel-field"><label>Título</label><div style="font-weight:600;font-size:16px;">📁 ${esc(item.title)}</div></div>
      <div class="panel-field"><label>Tags</label><div style="display:flex;gap:4px;flex-wrap:wrap;">${item.tags?.length ? item.tags.map(t => `<span class="tag tag-clickable" data-tag="${esc(t)}">${esc(t)}</span>`).join('') : 'Sin tags'}</div></div>
      <div class="panel-field"><label>Contenido</label><div class="markdown-preview">${renderMarkdown(item.content || '')}</div></div>
      ${children.length > 0 ? `
        <div class="panel-field"><label>Contenido (${children.length})</label>
          <div class="detail-children">
            ${children.map(c => {
              const icon = c.type === 'carpeta' ? '📁' : '';
              return `<div class="detail-child">
                <span class="child-link" data-id="${c.id}">${icon} ${esc(c.title)}</span>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}
    `;
    const pegCnt = clipboard.getCutCount();
    actions.innerHTML = `
      <button class="btn btn-secondary" id="note-detail-edit">✎ Editar</button>
      <button class="btn btn-danger" id="note-detail-delete">🗑 Eliminar</button>
      <div style="flex:1"></div>
      ${pegCnt > 0 ? `<button class="btn btn-secondary" id="note-detail-paste">📄 Pegar ${pegCnt}</button>` : ''}
      <button class="btn btn-primary" id="note-folder-add">+ Agregar aquí</button>
    `;
    panel.classList.add('open');

    actions.querySelector('#note-detail-edit').addEventListener('click', () => {
      body.innerHTML = this.renderEdit(item);
      actions.innerHTML = `
        <button class="btn btn-primary" id="note-edit-save">Guardar</button>
        <button class="btn btn-secondary" id="note-edit-cancel">Cancelar</button>
        <div style="flex:1"></div>
        <button class="btn btn-secondary" id="note-edit-cut">✂ Cortar</button>
      `;
      this.attachEditEvents(item);
    });

    actions.querySelector('#note-detail-delete').addEventListener('click', () => {
      if (confirm('¿Eliminar esta carpeta y su contenido?')) {
        this.store.delete(item.id);
        panel.classList.remove('open');
        this.render();
      }
    });

    actions.querySelector('#note-detail-paste')?.addEventListener('click', () => {
      if (clipboard.getCutCount() === 0) return;
      clipboard.pasteAll(item.id);
      document.getElementById('detail-panel').classList.remove('open');
      this.render();
    });

    actions.querySelector('#note-folder-add').addEventListener('click', () => {
      this.form.currentType = 'note';
      this.form.parentId = item.id;
      this.form.open(null);
      panel.classList.remove('open');
    });

    body.querySelectorAll('.child-link').forEach(el => {
      el.addEventListener('click', () => {
        const childItem = this.store.getById(el.dataset.id);
        if (childItem) this.openDetail(childItem);
      });
    });

    body.querySelectorAll('.tag-clickable').forEach(el => {
      el.addEventListener('click', () => {
        if (this.onTagClick) this.onTagClick(el.dataset.tag);
      });
    });
  }

  renderView(item) {
    const created = item.created
      ? new Date(item.created).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    const tags = item.tags?.length
      ? item.tags.map(t => `<span class="tag tag-clickable" data-tag="${esc(t)}">${esc(t)}</span>`).join('')
      : '';

    return `
      <div class="panel-field"><label>Título</label><div style="font-weight:600;font-size:16px;">${esc(item.title)}</div></div>
      <div class="panel-field"><label>Tags</label><div style="display:flex;gap:4px;flex-wrap:wrap;">${tags || 'Sin tags'}</div></div>
      <div class="panel-field"><label>Creado</label><div style="color:var(--text-secondary);font-size:13px;">${created}</div></div>
      <div class="panel-field"><label>Contenido</label><div class="markdown-preview">${renderMarkdown(item.content || '')}</div></div>
    `;
  }

  renderEdit(item) {
    return `
      <div class="panel-field"><label>Título</label><input id="note-edit-title" type="text" value="${esc(item.title)}" style="width:100%;"></div>
      <div class="panel-field"><label>Contenido (Markdown)</label>
        <button class="btn btn-secondary" id="note-edit-md-help" style="font-size:11px;padding:3px 8px;margin-bottom:4px;">? MD</button>
        <textarea id="note-edit-content" style="width:100%;min-height:200px;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:13px;resize:vertical;">${esc(item.content || '')}</textarea>
      </div>
    `;
  }

  attachEditEvents(item) {
    document.getElementById('note-edit-md-help')?.addEventListener('click', () => {
      document.getElementById('modal-md').classList.add('open');
    });

    document.getElementById('note-edit-save').addEventListener('click', () => {
      item.title = document.getElementById('note-edit-title')?.value.trim() || item.title;
      item.content = document.getElementById('note-edit-content')?.value || '';
      this.store.update(item);
      this.openDetail(item);
    });

    document.getElementById('note-edit-cancel').addEventListener('click', () => {
      this.openDetail(item);
    });

    document.getElementById('note-edit-cut').addEventListener('click', () => {
      clipboard.cutItem(item.id);
      this.openDetail(item);
    });
  }

  emptyState() {
    return `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      <h3>No hay notas</h3>
      <p>Crea tu primera nota con el botón +</p>
    </div>`;
  }
}
