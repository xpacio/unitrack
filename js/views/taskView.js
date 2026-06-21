export class TaskView {
  constructor(store, form) {
    this.store = store;
    this.form = form;
    this.container = document.getElementById('view-tasks');
    this.expanded = new Set();
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

  dragId = null;

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

      html += `
        <div class="tree-node" data-id="${item.id}">
          <div class="tree-row ${isCompleted ? 'completed' : ''}" draggable="true" data-id="${item.id}" style="margin-left:${depth * 20}px">
            <span class="tree-toggle ${hasChildren ? (isExpanded ? 'expanded' : '') : 'leaf'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
            </span>
            <input type="checkbox" class="tree-checkbox" ${isCompleted ? 'checked' : ''} data-id="${item.id}">
            <span class="tree-title">${this.esc(item.title)}</span>
            ${item.priority ? `<span class="tree-badge p-${item.priority}">${priorityLabel[item.priority]}</span>` : ''}
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
        if (item) this.form.open(item);
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
