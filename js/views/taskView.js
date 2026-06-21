export class TaskView {
  constructor(store, form, onTagClick) {
    this.store = store;
    this.form = form;
    this.onTagClick = onTagClick;
    this.container = document.getElementById('view-tasks');
    this.expanded = new Set();
    this.dragId = null;
    this.editingTask = null;
    this.render();
  }

  render() {
    const tasks = this.store.getByType('task');
    this.container.innerHTML = `
      <div class="search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" id="task-search" placeholder="Buscar tareas...">
      </div>
      <div class="tree-root" id="task-tree">
        ${this.renderTree(tasks)}
      </div>
      ${tasks.length === 0 ? this.emptyState() : ''}
    `;
    this.attachEvents();
  }

  renderTree(items, parentId = null, depth = 0) {
    const children = items
      .filter(i => i.parent_id === parentId)
      .sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2));
    if (children.length === 0) return '';

    let html = '';
    for (const item of children) {
      const hasChildren = items.some(i => i.parent_id === item.id);
      const isExpanded = this.expanded.has(item.id);
      const isCompleted = item.estado === 'completada';
      const priorityLabel = { 1: 'Alta', 2: 'Media', 3: 'Baja' };
      const dateStr = item.fecha_inicio
        ? new Date(item.fecha_inicio).toLocaleDateString('es', { month: 'short', day: 'numeric' })
        : '';

      const tags = item.tags?.length
        ? item.tags.map(t => `<span class="tree-badge tag-clickable" data-tag="${this.esc(t)}" style="background:var(--primary-light);color:var(--primary);cursor:pointer;">${this.esc(t)}</span>`).join('')
        : '';

      html += `
        <div class="tree-node" data-id="${item.id}">
          <div class="tree-row ${isCompleted ? 'completed' : ''}" draggable="true" data-id="${item.id}" style="margin-left:${depth * 20}px">
            <span class="tree-toggle ${hasChildren ? (isExpanded ? 'expanded' : '') : 'leaf'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
            </span>
            <input type="checkbox" class="tree-checkbox" ${isCompleted ? 'checked' : ''} data-id="${item.id}">
            <span class="tree-title">${this.esc(item.title)}</span>
            ${item.priority ? `<span class="tree-badge p-${item.priority}">${priorityLabel[item.priority]}</span>` : ''}
            ${tags}
            ${dateStr ? `<span class="tree-date">${dateStr}</span>` : ''}
            <span class="tree-actions">
              <button class="tree-action" data-action="add-sub" data-id="${item.id}" title="Agregar subtarea">+</button>
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
    const tree = this.container.querySelector('#task-tree');
    if (!tree) return;

    tree.addEventListener('click', (e) => {
      const tag = e.target.closest('.tag-clickable');
      if (tag && this.onTagClick) {
        this.onTagClick(tag.dataset.tag);
        return;
      }

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

      const titleEl = e.target.closest('.tree-title');
      if (titleEl) {
        const row = titleEl.closest('.tree-row');
        const item = this.store.getById(row?.dataset.id);
        if (item) this.openDetail(item);
        return;
      }

      const action = e.target.closest('[data-action]');
      if (!action) return;
      const id = action.dataset.id;
      const act = action.dataset.action;

      if (act === 'add-sub') {
        this.form.currentType = 'task';
        this.form.parentId = id;
        this.form.open(null);
      } else if (act === 'edit') {
        const item = this.store.getById(id);
        if (item) this.openDetail(item);
      } else if (act === 'delete') {
        if (confirm('¿Eliminar esta tarea y todas sus subtareas?')) {
          this.store.delete(id);
          this.render();
        }
      }
    });

    tree.addEventListener('change', (e) => {
      const cb = e.target.closest('.tree-checkbox');
      if (!cb) return;
      const item = this.store.getById(cb.dataset.id);
      if (item) {
        item.estado = cb.checked ? 'completada' : 'pendiente';
        this.store.update(item);
        this.render();
      }
    });

    tree.addEventListener('dragstart', (e) => {
      const row = e.target.closest('.tree-row');
      if (!row) return;
      this.dragId = row.dataset.id;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.id);
    });

    tree.addEventListener('dragend', (e) => {
      const row = e.target.closest('.tree-row');
      if (row) row.classList.remove('dragging');
      tree.querySelectorAll('.tree-row.drag-over').forEach(r => r.classList.remove('drag-over'));
      this.dragId = null;
    });

    tree.addEventListener('dragover', (e) => {
      e.preventDefault();
      const row = e.target.closest('.tree-row');
      if (!row || row.dataset.id === this.dragId) return;
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over');
    });

    tree.addEventListener('dragleave', (e) => {
      const row = e.target.closest('.tree-row');
      if (row) row.classList.remove('drag-over');
    });

    tree.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetRow = e.target.closest('.tree-row');
      if (!targetRow || !this.dragId || targetRow.dataset.id === this.dragId) return;
      const draggedItem = this.store.getById(this.dragId);
      if (!draggedItem) return;
      const descIds = this.store.getDescendantIds(this.dragId);
      if (descIds.includes(targetRow.dataset.id)) {
        alert('No podés mover una tarea a sus propios descendientes.');
        this.render();
        return;
      }
      draggedItem.parent_id = targetRow.dataset.id;
      this.store.update(draggedItem);
      this.render();
    });

    this.container.querySelector('#task-search')?.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (!q) { this.render(); return; }
      const results = this.store.search(q).filter(i => i.type === 'task');
      const tree = this.container.querySelector('#task-tree');
      tree.innerHTML = this.renderTree(results);
    });
  }

  openDetail(item) {
    this.editingTask = null;
    const panel = document.getElementById('detail-panel');
    const body = document.getElementById('panel-body');
    const title = document.getElementById('panel-title');
    const actions = document.getElementById('panel-actions');
    document.getElementById('panel-close').onclick = () => panel.classList.remove('open');

    title.textContent = 'Detalle de tarea';
    body.innerHTML = this.renderDetail(item);
    actions.innerHTML = `
      <button class="btn btn-secondary" id="task-detail-edit">✎ Editar</button>
      <button class="btn btn-danger" id="task-detail-delete">🗑 Eliminar</button>
    `;
    panel.classList.add('open');

    actions.querySelector('#task-detail-edit').addEventListener('click', () => {
      this.editingTask = item.id;
      body.innerHTML = this.renderDetailEdit(item);
      this.attachEditEvents(item);
    });

    actions.querySelector('#task-detail-delete').addEventListener('click', () => {
      if (confirm('¿Eliminar esta tarea y sus subtareas?')) {
        this.store.delete(item.id);
        panel.classList.remove('open');
        this.render();
      }
    });
  }

  renderDetail(item) {
    const priorityLabel = { 1: 'Alta', 2: 'Media', 3: 'Baja' };
    const estadoLabel = { pendiente: 'Pendiente', en_curso: 'En curso', completada: 'Completada' };
    const tags = item.tags?.length
      ? item.tags.map(t => `<span class="tag tag-clickable" data-tag="${this.esc(t)}">${this.esc(t)}</span>`).join('')
      : 'Sin tags';

    return `
      <div class="panel-field"><label>Título</label><div style="font-weight:600;font-size:16px;">${this.esc(item.title)}</div></div>
      ${item.priority ? `<div class="panel-field"><label>Prioridad</label><div><span class="tree-badge p-${item.priority}">${priorityLabel[item.priority]}</span></div></div>` : ''}
      <div class="panel-field"><label>Estado</label><div>${estadoLabel[item.estado] || item.estado}</div></div>
      <div class="panel-field"><label>Fechas</label><div style="color:var(--text-secondary);font-size:13px;">${item.fecha_inicio || '—'} → ${item.fecha_fin || '—'}</div></div>
      <div class="panel-field"><label>Tags</label><div style="display:flex;gap:4px;flex-wrap:wrap;">${tags}</div></div>
      <div class="panel-field"><label>Contenido</label><div class="markdown-preview">${this.renderMarkdown(item.content || '')}</div></div>
    `;
  }

  renderDetailEdit(item) {
    return `
      <div class="panel-field"><label>Título</label><input id="task-edit-title" type="text" value="${this.esc(item.title)}" style="width:100%;"></div>
      <div class="panel-field"><label>Prioridad</label>
        <div class="priority-group">
          <button class="priority-opt p-1 ${item.priority === 1 ? 'selected' : ''}" data-p="1">🔴 Alta</button>
          <button class="priority-opt p-2 ${item.priority === 2 ? 'selected' : ''}" data-p="2">🟡 Media</button>
          <button class="priority-opt p-3 ${item.priority === 3 ? 'selected' : ''}" data-p="3">🟢 Baja</button>
        </div>
      </div>
      <div class="panel-field"><label>Estado</label>
        <select id="task-edit-estado" style="width:100%;">
          <option value="pendiente" ${item.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
          <option value="en_curso" ${item.estado === 'en_curso' ? 'selected' : ''}>En curso</option>
          <option value="completada" ${item.estado === 'completada' ? 'selected' : ''}>Completada</option>
        </select>
      </div>
      <div class="panel-field"><label>Fechas</label><div style="display:flex;gap:8px;"><input id="task-edit-fi" type="date" value="${item.fecha_inicio || ''}" style="flex:1;"><input id="task-edit-ff" type="date" value="${item.fecha_fin || ''}" style="flex:1;"></div></div>
      <div class="panel-field"><label>Contenido (Markdown)</label>
        <button class="btn btn-secondary" id="task-edit-md-help" style="font-size:11px;padding:3px 8px;margin-bottom:4px;">? MD</button>
        <textarea id="task-edit-content" style="width:100%;min-height:150px;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:13px;resize:vertical;">${this.esc(item.content || '')}</textarea>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button class="btn btn-primary" id="task-edit-save">Guardar</button>
        <button class="btn btn-secondary" id="task-edit-cancel">Cancelar</button>
      </div>
    `;
  }

  attachEditEvents(item) {
    document.getElementById('task-edit-md-help')?.addEventListener('click', () => {
      document.getElementById('modal-md').classList.add('open');
    });

    document.getElementById('task-edit-save')?.addEventListener('click', () => {
      const title = document.getElementById('task-edit-title')?.value.trim();
      if (!title) { alert('El título es obligatorio'); return; }
      const selPri = document.querySelector('#detail-panel .priority-opt.selected');
      item.title = title;
      item.priority = parseInt(selPri?.dataset.p || '2');
      item.estado = document.getElementById('task-edit-estado')?.value || item.estado;
      item.fecha_inicio = document.getElementById('task-edit-fi')?.value || '';
      item.fecha_fin = document.getElementById('task-edit-ff')?.value || '';
      item.content = document.getElementById('task-edit-content')?.value || '';
      this.store.update(item);
      this.openDetail(item);
    });

    document.getElementById('task-edit-cancel')?.addEventListener('click', () => {
      this.openDetail(item);
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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
      <h3>No hay tareas</h3>
      <p>Crea tu primera tarea con el botón +</p>
    </div>`;
  }

  esc(s) {
    if (typeof s !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
}
