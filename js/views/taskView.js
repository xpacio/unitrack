import * as clipboard from '../clipboard.js';
import { esc, renderMarkdown, PRIORITY_LABELS, getTypeIcon } from '../helpers.js';
import { TreeRenderer } from '../treeRenderer.js';

export class TaskView {
  constructor(store, form, onTagClick) {
    this.store = store;
    this.form = form;
    this.onTagClick = onTagClick;
    this.container = document.getElementById('view-tasks');
    this.currentDetailId = null;
    this.tree = new TreeRenderer(store);
    this.render();
  }

  render() {
    const all = [...this.store.getByType('carpeta'), ...this.store.getByType('task')];
    const sortFn = (a, b) => {
      if (a.type === 'carpeta' && b.type !== 'carpeta') return -1;
      if (a.type !== 'carpeta' && b.type === 'carpeta') return 1;
      return (a.priority ?? 2) - (b.priority ?? 2);
    };
    this.container.innerHTML = `
      <div class="tree-root" id="task-tree">
        ${this.tree.render(null, 0, (item, depth, isExpanded, hasChildren) => this.renderRow(item, depth, isExpanded, hasChildren), sortFn)}
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
          <span class="tree-toggle${isExpanded ? ' expanded' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          </span>
          <span class="tree-folder-icon">📁</span>
          <span class="tree-title">${esc(item.title)}</span>
          ${tags}
          <span class="tree-count-badge">${childCount}</span>
        </div>`;
    }

    const isCompleted = item.estado === 'completada';
    const priorityLabel = { 1: 'Alta', 2: 'Media', 3: 'Baja' };
    const dateStr = item.fecha_inicio
      ? new Date(item.fecha_inicio).toLocaleDateString('es', { month: 'short', day: 'numeric' })
      : '';

    const tags = item.tags?.length
      ? item.tags.map(t => `<span class="tree-badge tag-clickable" data-tag="${esc(t)}" style="background:var(--primary-light);color:var(--primary);cursor:pointer;">${esc(t)}</span>`).join('')
      : '';

    return `
      <div class="tree-row ${isCompleted ? 'completed' : ''}" data-id="${item.id}" style="--tree-depth:${depth}">
        <span class="tree-toggle${isExpanded ? ' expanded' : ''}${!hasChildren ? ' leaf' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </span>
        <div class="tree-row-body" data-id="${item.id}">
          ${item.type === 'task'
            ? `<span class="tree-checkbox ${isCompleted ? 'checked' : ''}"></span>`
            : `<span class="tree-type-icon">${getTypeIcon(item.type)}</span>`}
          <span class="tree-title">${esc(item.title)}</span>
          ${item.priority ? `<span class="tree-badge p-${item.priority}">${priorityLabel[item.priority]}</span>` : ''}
          ${tags}
          ${dateStr ? `<span class="tree-date">${dateStr}</span>` : ''}
        </div>
      </div>`;
  }
}

  attachEvents() {
    const tree = this.container.querySelector('#task-tree');
    if (!tree) return;

    this.tree.setupToggle(tree);

    tree.addEventListener('click', (e) => {
      const tag = e.target.closest('.tag-clickable');
      if (tag && this.onTagClick) {
        this.onTagClick(tag.dataset.tag);
        return;
      }

      const checkbox = e.target.closest('.tree-checkbox');
      if (checkbox) {
        const row = checkbox.closest('.tree-row');
        if (row) {
          const item = this.store.getById(row.dataset.id);
          if (item && item.type === 'task') {
            item.estado = item.estado === 'completada' ? 'pendiente' : 'completada';
            item.updated = Date.now();
            this.store.update(item);
            this.render();
          }
        }
        return;
      }

      const body = e.target.closest('.tree-row-body');
      if (!body) return;
      const row = body.closest('.tree-row');
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

    if (item.type === 'carpeta') {
      this.openFolderDetail(item, panel, body, title, actions);
      return;
    }

    const ancestors = this.store.getAncestors(item.id);
    const breadcrumb = ancestors.map(a =>
      `<span class="bc-link" data-id="${a.id}">${esc(a.title)}</span>`
    ).join(' › ');

    title.innerHTML = breadcrumb
      ? `<span style="font-size:13px;color:var(--text-secondary);font-weight:400;">${breadcrumb} › </span><span style="font-weight:600;">${esc(item.title)}</span>`
      : esc(item.title);

    body.innerHTML = this.renderDetail(item);
    const pegCnt = clipboard.getCutCount();
    actions.innerHTML = `
      <button class="btn btn-secondary" id="task-detail-edit">✎ Editar</button>
      <button class="btn btn-danger" id="task-detail-delete">🗑 Eliminar</button>
      <div style="flex:1"></div>
      ${pegCnt > 0 ? `<button class="btn btn-secondary" id="task-detail-paste" data-action="paste">📄 Pegar ${pegCnt}</button>` : ''}
      <button class="btn btn-primary" id="task-detail-add-sub">+ Subtarea</button>
    `;
    panel.classList.add('open');
    this.attachPanelEvents(item);
  }

  openFolderDetail(item, panel, body, title, actions) {
    const children = this.store.getChildren(item.id)
      .sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2));

    title.textContent = esc(item.title);

    body.innerHTML = `
      <div class="panel-field"><label>Título</label><div style="font-weight:600;font-size:16px;">📁 ${esc(item.title)}</div></div>
      <div class="panel-field"><label>Tags</label><div style="display:flex;gap:4px;flex-wrap:wrap;">${item.tags?.length ? item.tags.map(t => `<span class="tag tag-clickable" data-tag="${esc(t)}">${esc(t)}</span>`).join('') : 'Sin tags'}</div></div>
      <div class="panel-field"><label>Contenido</label><div class="markdown-preview">${renderMarkdown(item.content || '')}</div></div>
      ${children.length > 0 ? `
        <div class="panel-field"><label>Contenido (${children.length})</label>
          <div class="detail-children">
            ${children.map(c => {
              const chkClass = c.type === 'task' && c.estado === 'completada' ? 'checked' : '';
              const icon = c.type === 'carpeta' ? '📁' : '';
              return `<div class="detail-child">
                ${c.type === 'task' ? `<span class="tree-checkbox ${chkClass}"></span>` : ''}
                <span class="child-link" data-id="${c.id}">${icon} ${esc(c.title)}</span>
                ${c.priority ? `<span class="tree-badge p-${c.priority}" style="margin-left:auto;">${['Alta','Media','Baja'][c.priority-1]}</span>` : ''}
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}
    `;
    const pegCnt = clipboard.getCutCount();
    actions.innerHTML = `
      <button class="btn btn-secondary" id="task-detail-edit">✎ Editar</button>
      <button class="btn btn-danger" id="task-detail-delete">🗑 Eliminar</button>
      <div style="flex:1"></div>
      ${pegCnt > 0 ? `<button class="btn btn-secondary" id="task-detail-paste" data-action="paste">📄 Pegar ${pegCnt}</button>` : ''}
      <button class="btn btn-primary" id="task-detail-add-sub">+ Agregar aquí</button>
    `;
    panel.classList.add('open');

    this.attachPanelEvents(item);
    this._attachFolderPanelEvents(item);
  }

  _attachFolderPanelEvents(item) {
    document.getElementById('task-detail-add-sub').addEventListener('click', () => {
      this.form.currentType = 'task';
      this.form.parentId = item.id;
      this.form.open(null);
      document.getElementById('detail-panel').classList.remove('open');
    });
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

      const detailChk = e.target.closest('.detail-child .tree-checkbox');
      if (detailChk) {
        const childLink = e.target.closest('.detail-child').querySelector('.child-link');
        if (childLink) {
          const childItem = this.store.getById(childLink.dataset.id);
          if (childItem) {
            childItem.estado = childItem.estado === 'completada' ? 'pendiente' : 'completada';
            childItem.updated = Date.now();
            this.store.update(childItem);
            this.openDetail(item);
          }
        }
        return;
      }

      const toggle = e.target.closest('.collapsible-toggle');
      if (toggle) {
        const collapsible = toggle.nextElementSibling;
        if (collapsible && collapsible.classList.contains('collapsible')) {
          collapsible.classList.toggle('expanded');
          toggle.classList.toggle('expanded');
        }
      }
    }, { signal });

    actions.querySelector('#task-detail-edit')?.addEventListener('click', () => {
      body.innerHTML = this.renderDetailEdit(item);
      actions.innerHTML = `
        <button class="btn btn-primary" id="task-edit-save">Guardar</button>
        <button class="btn btn-secondary" id="task-edit-cancel">Cancelar</button>
        <div style="flex:1"></div>
        <button class="btn btn-secondary" id="task-edit-cut">✂ Cortar</button>
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

    actions.querySelector('#task-detail-paste')?.addEventListener('click', () => {
      if (clipboard.getCutCount() === 0) return;
      clipboard.pasteAll(item.id);
      document.getElementById('detail-panel').classList.remove('open');
      this.render();
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
      ? item.tags.map(t => `<span class="tag tag-clickable" data-tag="${esc(t)}">${esc(t)}</span>`).join('')
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
      ? `<div class="panel-field">
         <div class="collapsible-toggle" data-toggle="siblings">
           <span class="chevron">▶</span>
           <span class="label">Hermanas</span>
           <span class="count">(${siblings.length})</span>
         </div>
         <div class="collapsible">
         <div class="detail-children">
           ${siblings.map(s => {
             const chkClass = s.estado === 'completada' ? 'checked' : '';
             return `<div class="detail-child">
               <span class="tree-checkbox ${chkClass}"></span>
               <span class="child-link" data-id="${s.id}">${esc(s.title)}</span>
               ${s.priority ? `<span class="tree-badge p-${s.priority}" style="margin-left:auto;">${['Alta','Media','Baja'][s.priority-1]}</span>` : ''}
             </div>`;
           }).join('')}
         </div></div></div>`
      : '';

    const childrenHtml = children.length > 0
      ? `<div class="panel-field">
         <div class="collapsible-toggle" data-toggle="children">
           <span class="chevron">▶</span>
           <span class="label">Subtareas</span>
           <span class="count">(${children.length})</span>
         </div>
         <div class="collapsible">
         <div class="detail-children">
           ${children.map(c => {
             const chkClass = c.estado === 'completada' ? 'checked' : '';
             return `<div class="detail-child">
               <span class="tree-checkbox ${chkClass}"></span>
               <span class="child-link" data-id="${c.id}">${esc(c.title)}</span>
               ${c.priority ? `<span class="tree-badge p-${c.priority}" style="margin-left:auto;">${['Alta','Media','Baja'][c.priority-1]}</span>` : ''}
             </div>`;
           }).join('')}
         </div></div></div>`
      : '';

    return `
      <div class="panel-field"><label>Título</label><div class="panel-value-title">${estadoCheckbox}${esc(item.title)}</div></div>
      <div style="display:flex;gap:12px;margin-bottom:16px;">
        ${item.priority ? `<div class="panel-field" style="flex:1;margin-bottom:0;"><label>Prioridad</label><div><span class="tree-badge p-${item.priority}">${priorityLabel[item.priority]}</span></div></div>` : ''}
        <div class="panel-field" style="flex:1;margin-bottom:0;"><label>Estado</label><div>${estadoLabel[item.estado] || item.estado}</div></div>
      </div>
      <div class="panel-field"><label>Fechas</label><div class="panel-value-date">${item.fecha_inicio || '—'} → ${item.fecha_fin || '—'}</div></div>
      <div class="panel-field"><label>Tags</label><div class="panel-value-tags">${tags}</div></div>
      <div class="panel-field"><label>Contenido</label><div class="markdown-preview">${renderMarkdown(item.content || '')}</div></div>
      ${siblingsHtml}
      ${childrenHtml}
    `;
  }

  renderDetailEdit(item) {
    return `
      <div class="panel-field"><label>Título</label><input id="task-edit-title" type="text" value="${esc(item.title)}"></div>
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
        <textarea id="task-edit-content">${esc(item.content || '')}</textarea>
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

    document.getElementById('task-edit-cut')?.addEventListener('click', () => {
      clipboard.cutItem(item.id);
      this.openDetail(item);
    });
  }

  emptyState() {
    return `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
      <h3>No hay tareas</h3>
      <p>Crea tu primera tarea con el botón +</p>
    </div>`;
  }
}
