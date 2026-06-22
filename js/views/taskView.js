export class TaskView {
  constructor(store, form, onTagClick) {
    this.store = store;
    this.form = form;
    this.onTagClick = onTagClick;
    this.container = document.getElementById('view-tasks');
    this.currentDetailId = null;
    this.render();
  }

  render() {
    const tasks = this.store.getByType('task');
    this.container.innerHTML = `
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
          <div class="tree-row ${isCompleted ? 'completed' : ''}" data-id="${item.id}" style="--tree-depth:${depth}">
            <span class="tree-checkbox ${isCompleted ? 'checked' : ''}"></span>
            <span class="tree-title">${this.esc(item.title)}</span>
            ${item.priority ? `<span class="tree-badge p-${item.priority}">${priorityLabel[item.priority]}</span>` : ''}
            ${tags}
            ${dateStr ? `<span class="tree-date">${dateStr}</span>` : ''}
          </div>
          ${this.renderTree(items, item.id, depth + 1)}
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

      const row = e.target.closest('.tree-row');
      if (!row) return;
      const item = this.store.getById(row.dataset.id);
      if (item) this.openDetail(item);
    });


  }

  openDetail(item) {
    this.currentDetailId = item.id;
    const panel = document.getElementById('detail-panel');
    const body = document.getElementById('panel-body');
    const title = document.getElementById('panel-title');
    const actions = document.getElementById('panel-actions');
    document.getElementById('panel-close').onclick = () => panel.classList.remove('open');

    const ancestors = this.store.getAncestors(item.id);
    const breadcrumb = ancestors.map(a =>
      `<span class="bc-link" data-id="${a.id}">${this.esc(a.title)}</span>`
    ).join(' › ');

    title.innerHTML = breadcrumb
      ? `<span style="font-size:13px;color:var(--text-secondary);font-weight:400;">${breadcrumb} › </span><span style="font-weight:600;">${this.esc(item.title)}</span>`
      : this.esc(item.title);

    body.innerHTML = this.renderDetail(item);
    actions.innerHTML = `
      <button class="btn btn-secondary" id="task-detail-edit">✎ Editar</button>
      <button class="btn btn-danger" id="task-detail-delete">🗑 Eliminar</button>
      <div style="flex:1"></div>
      <button class="btn btn-primary" id="task-detail-add-sub">+ Subtarea</button>
    `;
    panel.classList.add('open');

    this.attachPanelEvents(item);
  }

  attachPanelEvents(item) {
    const panel = document.getElementById('detail-panel');
    const body = document.getElementById('panel-body');
    const actions = document.getElementById('panel-actions');

    if (this._panelCleanup) this._panelCleanup();
    const controller = new AbortController();
    this._panelCleanup = () => controller.abort();
    const signal = controller.signal;

    panel.addEventListener('click', (e) => {
      const bc = e.target.closest('.bc-link');
      if (bc) {
        e.preventDefault();
        const navItem = this.store.getById(bc.dataset.id);
        if (navItem) this.openDetail(navItem);
        return;
      }

      const child = e.target.closest('.child-link');
      if (child) {
        e.preventDefault();
        const childItem = this.store.getById(child.dataset.id);
        if (childItem) this.openDetail(childItem);
        return;
      }

      const tag = e.target.closest('.tag-clickable');
      if (tag) {
        e.stopPropagation();
        if (this.onTagClick) this.onTagClick(tag.dataset.tag);
        return;
      }
    }, { signal });

    actions.querySelector('#task-detail-edit')?.addEventListener('click', () => {
      body.innerHTML = this.renderDetailEdit(item);
      actions.innerHTML = `
        <button class="btn btn-primary" id="task-edit-save">Guardar</button>
        <button class="btn btn-secondary" id="task-edit-cancel">Cancelar</button>
      `;
      this.attachEditEvents(item);
    });

    actions.querySelector('#task-detail-delete')?.addEventListener('click', () => {
      if (confirm('¿Eliminar esta tarea y sus subtareas?')) {
        this.store.delete(item.id);
        document.getElementById('detail-panel').classList.remove('open');
        this.render();
      }
    });

    actions.querySelector('#task-detail-add-sub')?.addEventListener('click', () => {
      this.form.currentType = 'task';
      this.form.parentId = item.id;
      this.form.open(null);
      document.getElementById('detail-panel').classList.remove('open');
    });
  }

  renderDetail(item) {
    const priorityLabel = { 1: 'Alta', 2: 'Media', 3: 'Baja' };
    const estadoLabel = { pendiente: 'Pendiente', en_curso: 'En curso', completada: 'Completada' };

    const tags = item.tags?.length
      ? item.tags.map(t => `<span class="tag tag-clickable" data-tag="${this.esc(t)}">${this.esc(t)}</span>`).join('')
      : 'Sin tags';

    const children = this.store.getChildren(item.id)
      .sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2));
    const siblings = this.store.getChildren(item.parent_id)
      .filter(s => s.id !== item.id)
      .sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2));

    let estadoCheckbox = '';
    if (item.estado === 'completada') {
      estadoCheckbox = '<span class="tree-checkbox checked" style="margin-right:4px;"></span>';
    } else if (item.estado === 'en_curso') {
      estadoCheckbox = '<span class="tree-checkbox partial" style="margin-right:4px;"></span>';
    } else {
      estadoCheckbox = '<span class="tree-checkbox" style="margin-right:4px;"></span>';
    }

    const siblingsHtml = siblings.length > 0
      ? `<div class="panel-field"><label>Hermanas (${siblings.length})</label>
         <div class="detail-children">
           ${siblings.map(s => {
             const chkClass = s.estado === 'completada' ? 'checked' : '';
             return `<div class="detail-child">
               <span class="tree-checkbox ${chkClass}"></span>
               <span class="child-link" data-id="${s.id}">${this.esc(s.title)}</span>
               ${s.priority ? `<span class="tree-badge p-${s.priority}" style="margin-left:auto;">${['Alta','Media','Baja'][s.priority-1]}</span>` : ''}
             </div>`;
           }).join('')}
         </div></div>`
      : '';

    const childrenHtml = children.length > 0
      ? `<div class="panel-field"><label>Subtareas (${children.length})</label>
         <div class="detail-children">
           ${children.map(c => {
             const chkClass = c.estado === 'completada' ? 'checked' : '';
             return `<div class="detail-child">
               <span class="tree-checkbox ${chkClass}"></span>
               <span class="child-link" data-id="${c.id}">${this.esc(c.title)}</span>
               ${c.priority ? `<span class="tree-badge p-${c.priority}" style="margin-left:auto;">${['Alta','Media','Baja'][c.priority-1]}</span>` : ''}
             </div>`;
           }).join('')}
         </div></div>`
      : '';

    return `
      <div class="panel-field"><label>Título</label><div class="panel-value-title">${estadoCheckbox}${this.esc(item.title)}</div></div>
      <div style="display:flex;gap:12px;margin-bottom:16px;">
        ${item.priority ? `<div class="panel-field" style="flex:1;margin-bottom:0;"><label>Prioridad</label><div><span class="tree-badge p-${item.priority}">${priorityLabel[item.priority]}</span></div></div>` : ''}
        <div class="panel-field" style="flex:1;margin-bottom:0;"><label>Estado</label><div>${estadoLabel[item.estado] || item.estado}</div></div>
      </div>
      <div class="panel-field"><label>Fechas</label><div class="panel-value-date">${item.fecha_inicio || '—'} → ${item.fecha_fin || '—'}</div></div>
      <div class="panel-field"><label>Tags</label><div class="panel-value-tags">${tags}</div></div>
      <div class="panel-field"><label>Contenido</label><div class="markdown-preview">${this.renderMarkdown(item.content || '')}</div></div>
      ${siblingsHtml}
      ${childrenHtml}
    `;
  }

  renderDetailEdit(item) {
    return `
      <div class="panel-field"><label>Título</label><input id="task-edit-title" type="text" value="${this.esc(item.title)}"></div>
      <div class="panel-field"><label>Prioridad</label>
        <div class="priority-group">
          <button class="priority-opt p-1 ${item.priority === 1 ? 'selected' : ''}" data-p="1">🔴 Alta</button>
          <button class="priority-opt p-2 ${item.priority === 2 ? 'selected' : ''}" data-p="2">🟡 Media</button>
          <button class="priority-opt p-3 ${item.priority === 3 ? 'selected' : ''}" data-p="3">🟢 Baja</button>
        </div>
      </div>
      <div class="panel-field"><label>Estado</label>
        <select id="task-edit-estado">
          <option value="pendiente" ${item.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
          <option value="en_curso" ${item.estado === 'en_curso' ? 'selected' : ''}>En curso</option>
          <option value="completada" ${item.estado === 'completada' ? 'selected' : ''}>Completada</option>
        </select>
      </div>
      <div class="panel-field"><label>Fechas</label><div style="display:flex;gap:8px;"><input id="task-edit-fi" type="date" value="${item.fecha_inicio || ''}" style="flex:1;"><input id="task-edit-ff" type="date" value="${item.fecha_fin || ''}" style="flex:1;"></div></div>
      <div class="panel-field"><label>Contenido (Markdown)</label>
        <button class="btn btn-secondary" id="task-edit-md-help" style="font-size:11px;padding:3px 8px;margin-bottom:4px;">? MD</button>
        <textarea id="task-edit-content">${this.esc(item.content || '')}</textarea>
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
