export class NoteView {
  constructor(store, form, onTagClick) {
    this.store = store;
    this.form = form;
    this.onTagClick = onTagClick;
    this.container = document.getElementById('view-notes');
    this.expanded = new Set();
    this.selectedId = null;
    this.editing = false;
    this.treeCollapsed = false;
    this.render();
  }

  render() {
    const notes = this.store.getByType('note');
    this.container.innerHTML = `
      <div class="search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" id="note-search" placeholder="Buscar notas...">
      </div>
      <div class="note-split">
        <div class="note-tree-panel ${this.treeCollapsed ? 'collapsed' : ''}">
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:8px;">
            <button class="note-collapse-btn" id="note-collapse-toggle">${this.treeCollapsed ? '▶' : '◀'}</button>
            <span style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.3px;">Notas</span>
          </div>
          <div class="tree-root" id="note-tree">
            ${this.renderTree(notes)}
          </div>
          ${notes.length === 0 ? this.emptyState() : ''}
        </div>
        <div class="note-editor-panel" id="note-editor">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            <h3>Seleccioná una nota</h3>
            <p>Hacé clic en una nota del árbol para verla</p>
          </div>
        </div>
      </div>
    `;
    this.attachEvents();
  }

  renderTree(items, parentId = null, depth = 0) {
    const children = items.filter(i => i.parent_id === parentId);
    if (children.length === 0) return '';

    let html = '';
    for (const item of children) {
      const hasChildren = items.some(i => i.parent_id === item.id);
      const isExpanded = this.expanded.has(item.id);
      const preview = (item.content || '').replace(/[#*`\[\]]/g, '').trim().slice(0, 60);

      html += `
        <div class="tree-node" data-id="${item.id}">
          <div class="tree-row" data-id="${item.id}" style="padding-left:${depth * 20 + 8}px">
            <span class="tree-toggle ${hasChildren ? (isExpanded ? 'expanded' : '') : 'leaf'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
            </span>
            <span class="tree-title">${this.esc(item.title)}</span>
            ${preview ? `<span class="tree-preview">— ${this.esc(preview)}</span>` : ''}
            <span class="tree-actions">
              <button class="tree-action" data-action="add-sub" data-id="${item.id}" title="Agregar sub-nota">+</button>
              <button class="tree-action danger" data-action="delete" data-id="${item.id}" title="Eliminar">✕</button>
            </span>
          </div>
          <div class="tree-children" style="display: ${isExpanded ? 'block' : 'none'}">
            ${this.renderTree(items, item.id, depth + 1)}
          </div>
        </div>`;
    }
    return html;
  }

  attachEvents() {
    const tree = this.container.querySelector('#note-tree');
    if (tree) {
      tree.addEventListener('click', (e) => {
        const toggle = e.target.closest('.tree-toggle:not(.leaf)');
        if (toggle) {
          const node = toggle.closest('.tree-node');
          const childrenDiv = node.querySelector('.tree-children');
          if (childrenDiv) {
            const isHidden = childrenDiv.style.display === 'none';
            childrenDiv.style.display = isHidden ? 'block' : 'none';
            toggle.classList.toggle('expanded', isHidden);
            if (isHidden) this.expanded.add(node.dataset.id);
            else this.expanded.delete(node.dataset.id);
          }
          return;
        }

        const tag = e.target.closest('.tag-clickable');
        if (tag && this.onTagClick) {
          this.onTagClick(tag.dataset.tag);
          return;
        }

        const row = e.target.closest('.tree-row');
        if (row && !e.target.closest('.tree-actions, .tree-action')) {
          const id = row.dataset.id;
          const item = this.store.getById(id);
          if (item) this.openEditor(item);
          return;
        }

        const action = e.target.closest('[data-action]');
        if (!action) return;
        const id = action.dataset.id;
        const act = action.dataset.action;

        if (act === 'add-sub') {
          this.form.currentType = 'note';
          this.form.parentId = id;
          this.form.open(null);
        } else if (act === 'delete') {
          if (confirm('¿Eliminar esta nota y sus sub-notas?')) {
            this.store.delete(id);
            if (this.selectedId === id) this.selectedId = null;
            this.render();
          }
        }
      });
    }

    this.container.querySelector('#note-search')?.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (!q) { this.render(); return; }
      const results = this.store.search(q).filter(i => i.type === 'note');
      const tree = this.container.querySelector('#note-tree');
      tree.innerHTML = this.renderTree(results);
    });

    this.container.querySelector('#note-collapse-toggle')?.addEventListener('click', () => {
      this.treeCollapsed = !this.treeCollapsed;
      const panel = this.container.querySelector('.note-tree-panel');
      panel.classList.toggle('collapsed', this.treeCollapsed);
      this.container.querySelector('#note-collapse-toggle').textContent = this.treeCollapsed ? '▶' : '◀';
    });
  }

  openEditor(item) {
    this.selectedId = item.id;
    this.editing = false;
    const editor = this.container.querySelector('#note-editor');
    editor.innerHTML = this.renderEditor(item);
    this.attachEditorEvents(item);
  }

  renderEditor(item) {
    const created = item.created ? new Date(item.created).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';

    if (this.editing) {
      return `
        <div class="panel-field">
          <label>Título</label>
          <input id="note-edit-title" type="text" value="${this.esc(item.title)}" style="width:100%;">
        </div>
        <div class="panel-field" style="margin-bottom:8px;">
          <label>Contenido (Markdown)</label>
          <button class="btn btn-secondary" id="note-md-help" style="font-size:11px;padding:3px 8px;margin-bottom:4px;">? MD</button>
          <textarea id="note-edit-content" style="width:100%;min-height:200px;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:13px;resize:vertical;">${this.esc(item.content || '')}</textarea>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button class="btn btn-primary" id="note-save-edit">Guardar</button>
          <button class="btn btn-secondary" id="note-cancel-edit">Cancelar</button>
        </div>
      `;
    }

    const tags = item.tags?.length
      ? `<div style="margin-bottom:8px;display:flex;gap:4px;flex-wrap:wrap;">${item.tags.map(t => `<span class="tag tag-clickable" data-tag="${this.esc(t)}">${this.esc(t)}</span>`).join('')}</div>`
      : '';

    return `
      <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <h2 style="font-size:18px;font-weight:600;line-height:1.3;">${this.esc(item.title)}</h2>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          <button class="btn btn-secondary" id="note-edit-toggle" style="font-size:12px;padding:5px 10px;">✎ Editar</button>
          <button class="btn btn-danger" id="note-delete-btn" style="font-size:12px;padding:5px 10px;">🗑</button>
        </div>
      </div>
      ${tags}
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">Creado: ${created}</div>
      <hr style="border:none;border-top:1px solid var(--border-light);margin-bottom:12px;">
      <div class="markdown-preview">${this.renderMarkdown(item.content || '')}</div>
    `;
  }

  attachEditorEvents(item) {
    const mdHelp = this.container.querySelector('#note-md-help');
    if (mdHelp) {
      mdHelp.addEventListener('click', () => {
        document.getElementById('modal-md').classList.add('open');
      });
    }

    const editToggle = this.container.querySelector('#note-edit-toggle');
    if (editToggle) {
      editToggle.addEventListener('click', () => {
        this.editing = true;
        this.openEditor(item);
      });
    }

    const deleteBtn = this.container.querySelector('#note-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (confirm('¿Eliminar esta nota?')) {
          this.store.delete(item.id);
          this.selectedId = null;
          this.render();
        }
      });
    }

    const saveBtn = this.container.querySelector('#note-save-edit');
    const cancelBtn = this.container.querySelector('#note-cancel-edit');
    const textarea = this.container.querySelector('#note-edit-content');
    const titleInput = this.container.querySelector('#note-edit-title');

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        item.title = titleInput?.value.trim() || item.title;
        item.content = textarea?.value || '';
        this.store.update(item);
        this.editing = false;
        this.openEditor(item);
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.editing = false;
        this.openEditor(item);
      });
    }

    this.container.querySelectorAll('.tag-clickable')?.forEach(el => {
      el.addEventListener('click', (e) => {
        if (this.onTagClick) this.onTagClick(e.currentTarget.dataset.tag);
      });
    });
  }

  renderMarkdown(text) {
    if (!text) return '<p style="color:var(--text-muted)"><em>Sin contenido</em></p>';
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/^\- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(?!<[hul])/gm, '<p>')
      .replace(/$/gm, '</p>')
      .replace(/<\/p>\n<p>/g, '</p><p>')
      .replace(/<li><\/li>/g, '')
      .replace(/<ul>\s*<\/ul>/g, '')
      .replace(/<p><\/p>/g, '');
  }

  emptyState() {
    return `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      <h3>No hay notas</h3>
      <p>Crea tu primera nota con el botón +</p>
    </div>`;
  }

  esc(s) {
    if (typeof s !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
}
