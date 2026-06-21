import { createItem } from '../store.js';

export class ItemForm {
  constructor(store, onSave) {
    this.store = store;
    this.onSave = onSave;
    this.currentId = null;
    this.currentType = 'task';
    this.parentId = null;
    this.tags = [];
    this.modal = document.getElementById('modal');
    this.title = document.getElementById('modal-title');
    this.body = document.getElementById('modal-body');
    this.saveBtn = document.getElementById('modal-save');
    this.cancelBtn = document.getElementById('modal-cancel');
    this.closeBtn = document.getElementById('modal-close');

    this.cancelBtn.addEventListener('click', () => this.close());
    this.closeBtn.addEventListener('click', () => this.close());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });
    this.saveBtn.addEventListener('click', () => this.submit());
  }

  open(data = null) {
    if (data) {
      this.currentId = data.id;
      this.currentType = data.type;
      this.parentId = data.parent_id || null;
      this.title.textContent = `Editar ${this.typeLabel(data.type)}`;
    } else {
      this.currentId = null;
      this.title.textContent = `Nuevo ${this.typeLabel(this.currentType)}`;
    }
    this.render(data);
    this.modal.classList.add('open');
  }

  typeLabel(t) {
    const map = { task: 'Tarea', note: 'Nota', event: 'Evento', suscripcion: 'Suscripción', gasto: 'Gasto', ahorro: 'Ahorro' };
    return map[t] || t;
  }

  close() {
    this.modal.classList.remove('open');
    this.currentId = null;
    this.parentId = null;
    this.tags = [];
  }

  render(data) {
    const item = data || { type: this.currentType, title: '', content: '', parent_id: this.parentId, priority: 2, fecha_inicio: '', fecha_fin: '', tags: [], estado: 'pendiente', monto: 0, periodicidad: '', meta: 0, acumulado: 0 };
    this.tags = [...(item.tags || [])];

    this.body.innerHTML = `
      <div class="panel-field">
        <label>Tipo</label>
        <select id="f-type">
          <option value="task" ${item.type === 'task' ? 'selected' : ''}>Tarea</option>
          <option value="note" ${item.type === 'note' ? 'selected' : ''}>Nota</option>
          <option value="event" ${item.type === 'event' ? 'selected' : ''}>Evento</option>
          <option value="suscripcion" ${item.type === 'suscripcion' ? 'selected' : ''}>Suscripción</option>
          <option value="gasto" ${item.type === 'gasto' ? 'selected' : ''}>Gasto</option>
          <option value="ahorro" ${item.type === 'ahorro' ? 'selected' : ''}>Ahorro</option>
        </select>
      </div>
      <div class="panel-field">
        <label>Título</label>
        <input id="f-title" type="text" value="${this.esc(item.title)}" placeholder="Título..." autofocus>
      </div>
      <div class="panel-field" id="f-monto-group">
        <label>Monto</label>
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="font-size:16px;font-weight:600;color:var(--text-secondary);">$</span>
          <input id="f-monto" type="number" step="0.01" min="0" value="${item.monto || 0}" style="flex:1;">
        </div>
      </div>
      <div class="panel-field" id="f-periodicidad-group">
        <label>Periodicidad</label>
        <select id="f-periodicidad">
          <option value="">-- Sin periodicidad --</option>
          <option value="mensual" ${item.periodicidad === 'mensual' ? 'selected' : ''}>Mensual</option>
          <option value="bimestral" ${item.periodicidad === 'bimestral' ? 'selected' : ''}>Bimestral</option>
        </select>
      </div>
      <div class="panel-field" id="f-ahorro-group">
        <label>Meta de ahorro</label>
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="font-size:16px;font-weight:600;color:var(--text-secondary);">$</span>
          <input id="f-meta" type="number" step="0.01" min="0" value="${item.meta || 0}" placeholder="Meta..." style="flex:1;">
        </div>
        <div style="margin-top:6px;display:flex;align-items:center;gap:4px;">
          <span style="font-size:12px;color:var(--text-secondary);">Ahorrado:</span>
          <span style="font-size:16px;font-weight:600;color:var(--text-secondary);">$</span>
          <input id="f-acumulado" type="number" step="0.01" min="0" value="${item.acumulado || 0}" style="flex:1;">
        </div>
      </div>
      <div class="panel-field" id="f-priority-group">
        <label>Prioridad</label>
        <div class="priority-group">
          <button class="priority-opt p-1 ${item.priority === 1 ? 'selected' : ''}" data-p="1">🔴 Alta</button>
          <button class="priority-opt p-2 ${item.priority === 2 ? 'selected' : ''}" data-p="2">🟡 Media</button>
          <button class="priority-opt p-3 ${item.priority === 3 ? 'selected' : ''}" data-p="3">🟢 Baja</button>
        </div>
      </div>
      <div class="panel-field" id="f-dates-group">
        <div style="display:flex;gap:8px;">
          <div style="flex:1">
            <label>Fecha inicio / Próximo pago</label>
            <input id="f-fecha-inicio" type="date" value="${item.fecha_inicio || ''}">
          </div>
          <div style="flex:1">
            <label>Fecha fin</label>
            <input id="f-fecha-fin" type="date" value="${item.fecha_fin || ''}">
          </div>
        </div>
      </div>
      <div class="panel-field" id="f-estado-group">
        <label>Estado</label>
        <select id="f-estado">
        </select>
      </div>
      <div class="panel-field">
        <label>Contenido (Markdown)</label>
        <textarea id="f-content" rows="6" placeholder="Notas...">${this.esc(item.content || '')}</textarea>
      </div>
      <div class="panel-field">
        <label>Tags</label>
        <div class="tags-container" id="tags-container">
          ${this.tags.map(t => `<span class="tag">${this.esc(t)}<button class="tag-remove" data-tag="${this.esc(t)}">×</button></span>`).join('')}
          <input class="tag-input" id="tag-input" type="text" placeholder="Agregar tag..." autocomplete="off">
        </div>
      </div>
      <div class="panel-field">
        <label>Padre (ID)</label>
        <input id="f-parent" type="text" value="${item.parent_id || ''}" placeholder="ID del padre (opcional)">
      </div>
    `;

    this.attachEvents();
    this.updateVisibility(item.type);
    this.updateEstadoOptions(item);
  }

  updateEstadoOptions(item) {
    const sel = this.body.querySelector('#f-estado');
    if (!sel) return;
    const type = this.body.querySelector('#f-type').value;
    let opts = [];
    if (type === 'suscripcion') {
      opts = ['activa', 'pausada', 'cancelada'];
    } else if (type === 'ahorro') {
      opts = ['activa', 'completada'];
    } else if (type === 'note') {
      opts = [];
    } else {
      opts = ['pendiente', 'en_curso', 'completada'];
    }
    sel.innerHTML = opts.map(v =>
      `<option value="${v}" ${(item.estado || opts[0]) === v ? 'selected' : ''}>${v.charAt(0).toUpperCase() + v.slice(1)}</option>`
    ).join('');
  }

  attachEvents() {
    const typeSel = this.body.querySelector('#f-type');
    typeSel.addEventListener('change', () => {
      this.currentType = typeSel.value;
      const placeholder = { task: 'Tarea', note: 'Nota', event: 'Evento', suscripcion: 'Suscripción', gasto: 'Gasto', ahorro: 'Ahorro' };
      this.updateVisibility(typeSel.value);
      this.updateEstadoOptions({ type: typeSel.value, estado: null });
    });

    const tagInput = this.body.querySelector('#tag-input');
    const container = this.body.querySelector('#tags-container');

    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = tagInput.value.trim();
        if (val && !this.tags.includes(val)) {
          this.tags.push(val);
          this.renderTags(container);
        }
        tagInput.value = '';
      }
    });

    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.tag-remove');
      if (btn) {
        this.tags = this.tags.filter(t => t !== btn.dataset.tag);
        this.renderTags(container);
      }
    });

    this.body.querySelectorAll('.priority-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        this.body.querySelectorAll('.priority-opt').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }

  renderTags(container) {
    const input = container.querySelector('.tag-input');
    const tags = this.tags.map(t =>
      `<span class="tag">${this.esc(t)}<button class="tag-remove" data-tag="${this.esc(t)}">×</button></span>`
    ).join('');
    container.innerHTML = tags + `<input class="tag-input" id="tag-input" type="text" placeholder="Agregar tag..." autocomplete="off">`;
    container.querySelector('.tag-input').focus();
    this.attachEvents();
  }

  updateVisibility(type) {
    const pg = this.body.querySelector('#f-priority-group');
    const dg = this.body.querySelector('#f-dates-group');
    const eg = this.body.querySelector('#f-estado-group');
    const mg = this.body.querySelector('#f-monto-group');
    const per = this.body.querySelector('#f-periodicidad-group');
    const ag = this.body.querySelector('#f-ahorro-group');

    pg.style.display = (type === 'note' || type === 'ahorro' || type === 'gasto') ? 'none' : '';
    dg.style.display = (type === 'ahorro' || type === 'gasto') ? 'none' : '';
    eg.style.display = type === 'note' ? 'none' : '';
    mg.style.display = (type === 'suscripcion' || type === 'gasto' || type === 'ahorro') ? '' : 'none';
    per.style.display = type === 'suscripcion' ? '' : 'none';
    ag.style.display = type === 'ahorro' ? '' : 'none';
  }

  submit() {
    const type = this.body.querySelector('#f-type').value;
    const title = this.body.querySelector('#f-title').value.trim();
    if (!title) { alert('El título es obligatorio'); return; }

    const selPri = this.body.querySelector('.priority-opt.selected');
    const priority = (type === 'note' || type === 'ahorro' || type === 'gasto') ? null : parseInt(selPri?.dataset.p || '2');

    const data = {
      type,
      title,
      content: this.body.querySelector('#f-content').value,
      parent_id: this.body.querySelector('#f-parent').value.trim() || null,
      tags: this.tags,
      priority,
      fecha_inicio: type === 'ahorro' ? '' : this.body.querySelector('#f-fecha-inicio').value,
      fecha_fin: type === 'ahorro' || type === 'gasto' ? '' : this.body.querySelector('#f-fecha-fin').value,
      estado: type === 'note' ? null : this.body.querySelector('#f-estado').value,
      monto: (type === 'suscripcion' || type === 'gasto' || type === 'ahorro') ? parseFloat(this.body.querySelector('#f-monto').value) || 0 : 0,
      periodicidad: type === 'suscripcion' ? this.body.querySelector('#f-periodicidad').value : null,
      meta: type === 'ahorro' ? parseFloat(this.body.querySelector('#f-meta').value) || 0 : 0,
      acumulado: type === 'ahorro' ? parseFloat(this.body.querySelector('#f-acumulado').value) || 0 : 0,
    };

    if (this.currentId) {
      const existing = this.store.getById(this.currentId);
      Object.assign(existing, data, { id: this.currentId });
      this.store.update(existing);
    } else {
      this.store.add(createItem(data));
    }

    this.close();
    if (this.onSave) this.onSave();
  }

  esc(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
}
