export class NoteView {
  constructor(store, form) {
    this.store = store;
    this.form = form;
    this.container = document.getElementById('view-notes');
    this.expanded = new Set();
    this.selectedId = null;
    this.editing = false;
    this.content = '';
    this.render();
  }

  render() {
    const notes = this.store.getByType('note');
    this.container.innerHTML = `
      <div class="search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" id="note-search" placeholder="Buscar notas...">
      </div>
      <div style="display:flex;gap:16px;height:calc(100vh - 120px);">
        <div style="flex:1;overflow-y:auto;">
          <div class="tree-root" id="note-tree">
            ${this.renderTree(notes)}
          </div>
          ${notes.length === 0 ? this.emptyState() : ''}
        </div>
        <div style="flex:1;overflow-y:auto;border-left:1px solid var(--border);padding-left:16px;" id="note-editor">
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
      const preview = (item.content || '').replace(/[#*`\[\]]/g, '').trim().slice(0, 80);

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
              <button class="tree-action" data-action="edit" data-id="${item.id}" title="Editar">✎</button>
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
    if (!tree) return;

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
      } else if (act === 'edit') {
        const item = this.store.getById(id);
        if (item) this.form.open(item);
      } else if (act === 'delete') {
        if (confirm('¿Eliminar esta nota y sus sub-notas?')) {
          this.store.delete(id);
          if (this.selectedId === id) this.selectedId = null;
          this.render();
        }
      }
    });

    this.container.querySelector('#note-search')?.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (!q) { this.render(); return; }
      const results = this.store.search(q).filter(i => i.type === 'note');
      const tree = this.container.querySelector('#note-tree');
      tree.innerHTML = this.renderTree(results);
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
    return `
      <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
        <h2 style="font-size:16px;font-weight:600;">${this.esc(item.title)}</h2>
        <button class="btn btn-secondary" id="edit-toggle" style="font-size:12px;">✎ Editar</button>
      </div>
      ${item.tags?.length ? `<div style="margin-bottom:8px;display:flex;gap:4px;flex-wrap:wrap;">${item.tags.map(t => `<span class="tag">${this.esc(t)}</span>`).join('')}</div>` : ''}
      <div id="note-content-display" class="markdown-preview">${this.renderMarkdown(item.content || '')}</div>
      <div id="note-content-edit" class="hidden">
        <textarea id="note-textarea" style="width:100%;min-height:200px;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:13px;resize:vertical;">${this.esc(item.content || '')}</textarea>
        <div style="margin-top:8px;display:flex;gap:8px;">
          <button class="btn btn-primary" id="note-save-edit" style="font-size:12px;">Guardar</button>
          <button class="btn btn-secondary" id="note-cancel-edit" style="font-size:12px;">Cancelar</button>
        </div>
      </div>
      <div class="editor-tabs" style="margin-top:12px;">
        <button class="editor-tab active" data-tab="preview">Vista</button>
        <button class="editor-tab" data-tab="raw">Markdown</button>
      </div>
      <div id="tab-preview" class="markdown-preview">${this.renderMarkdown(item.content || '')}</div>
      <div id="tab-raw" class="hidden"><pre style="font-size:12px;color:var(--text-secondary);white-space:pre-wrap;">${this.esc(item.content || '')}</pre></div>
    `;
  }

  attachEditorEvents(item) {
    const toggleBtn = this.container.querySelector('#edit-toggle');
    const display = this.container.querySelector('#note-content-display');
    const edit = this.container.querySelector('#note-content-edit');
    const textarea = this.container.querySelector('#note-textarea');

    toggleBtn?.addEventListener('click', () => {
      if (edit.classList.contains('hidden')) {
        display.classList.add('hidden');
        edit.classList.remove('hidden');
        toggleBtn.textContent = '✕ Cancelar';
      } else {
        display.classList.remove('hidden');
        edit.classList.add('hidden');
        toggleBtn.textContent = '✎ Editar';
      }
    });

    this.container.querySelector('#note-save-edit')?.addEventListener('click', () => {
      item.content = textarea.value;
      this.store.update(item);
      this.openEditor(item);
    });

    this.container.querySelector('#note-cancel-edit')?.addEventListener('click', () => {
      this.openEditor(item);
    });

    this.container.querySelectorAll('.editor-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.container.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        this.container.querySelector('#tab-preview').classList.toggle('hidden', target !== 'preview');
        this.container.querySelector('#tab-raw').classList.toggle('hidden', target !== 'raw');
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
