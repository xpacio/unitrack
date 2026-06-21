export class TimelineView {
  constructor(store, form, onTagClick) {
    this.store = store;
    this.form = form;
    this.onTagClick = onTagClick;
    this.container = document.getElementById('view-timeline');
    this.interval = null;
    this.render();
    this.startClock();
  }

  render() {
    const items = this.store.getTimelineItems();
    const grouped = this.groupByDay(items);

    this.container.innerHTML = `
      <div style="max-width:640px;margin:0 auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h2 style="font-size:16px;font-weight:600;">Timeline</h2>
          <button class="btn btn-secondary" id="tl-refresh" style="font-size:12px;">↻ Actualizar</button>
        </div>
        <div class="timeline">
          ${grouped.length === 0 ? this.emptyState() : grouped.map(day => this.renderDay(day)).join('')}
        </div>
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    this.container.querySelector('#tl-refresh')?.addEventListener('click', () => {
      this.render();
      this.startClock();
    });

    this.container.querySelector('.timeline')?.addEventListener('click', (e) => {
      const card = e.target.closest('.timeline-card');
      if (!card) return;

      const tag = e.target.closest('.tag-clickable');
      if (tag && this.onTagClick) {
        this.onTagClick(tag.dataset.tag);
        return;
      }

      const item = this.store.getById(card.dataset.id);
      if (item) this.openDetail(item);
    });
  }

  openDetail(item) {
    const panel = document.getElementById('detail-panel');
    const body = document.getElementById('panel-body');
    const title = document.getElementById('panel-title');
    const actions = document.getElementById('panel-actions');

    title.textContent = item.type === 'task' ? 'Tarea' : 'Evento';
    body.innerHTML = this.renderView(item);
    actions.innerHTML = `
      <button class="btn btn-secondary" id="tl-detail-edit">✎ Editar</button>
      <button class="btn btn-danger" id="tl-detail-delete">🗑 Eliminar</button>
    `;
    panel.classList.add('open');

    body.querySelectorAll('.tag-clickable').forEach(el => {
      el.addEventListener('click', () => {
        if (this.onTagClick) this.onTagClick(el.dataset.tag);
      });
    });

    actions.querySelector('#tl-detail-edit').addEventListener('click', () => {
      body.innerHTML = this.renderEdit(item);
      actions.innerHTML = `
        <button class="btn btn-primary" id="tl-edit-save">Guardar</button>
        <button class="btn btn-secondary" id="tl-edit-cancel">Cancelar</button>
      `;
      this.attachEditEvents(item);
    });

    actions.querySelector('#tl-detail-delete').addEventListener('click', () => {
      if (confirm('¿Eliminar este elemento?')) {
        this.store.delete(item.id);
        panel.classList.remove('open');
        this.render();
      }
    });
  }

  renderView(item) {
    const priorityLabel = { 1: 'Alta', 2: 'Media', 3: 'Baja' };
    const typeLabel = item.type === 'task' ? 'Tarea' : 'Evento';
    const countdown = this.getCountdown(item.fecha_inicio);
    const countdownClass = countdown.urgent ? 'urgent' : countdown.soon ? 'soon' : 'later';

    const tags = item.tags?.length
      ? item.tags.map(t => `<span class="tag tag-clickable" data-tag="${this.esc(t)}">${this.esc(t)}</span>`).join('')
      : '';

    return `
      <div class="panel-field"><label>Título</label><div style="font-weight:600;font-size:16px;">${this.esc(item.title)}</div></div>
      <div class="panel-field"><label>Tipo</label><div><span class="timeline-card-tag ${item.type}">${typeLabel}</span></div></div>
      ${item.priority ? `<div class="panel-field"><label>Prioridad</label><div><span class="tree-badge p-${item.priority}">${priorityLabel[item.priority]}</span></div></div>` : ''}
      <div class="panel-field"><label>Fechas</label><div style="color:var(--text-secondary);font-size:13px;">${item.fecha_inicio || '—'} → ${item.fecha_fin || '—'}</div></div>
      <div class="panel-field"><label>Tags</label><div style="display:flex;gap:4px;flex-wrap:wrap;">${tags || 'Sin tags'}</div></div>
      <div class="panel-field"><label>Cuenta regresiva</label><div><span class="timeline-card-countdown ${countdownClass}">${countdown.text}</span></div></div>
      <div class="panel-field"><label>Contenido</label><div class="markdown-preview">${this.renderMarkdown(item.content || '')}</div></div>
    `;
  }

  renderEdit(item) {
    return `
      <div class="panel-field"><label>Título</label><input id="tl-edit-title" type="text" value="${this.esc(item.title)}" style="width:100%;"></div>
      <div class="panel-field"><label>Prioridad</label>
        <div class="priority-group">
          <button class="priority-opt p-1 ${item.priority === 1 ? 'selected' : ''}" data-p="1">🔴 Alta</button>
          <button class="priority-opt p-2 ${item.priority === 2 ? 'selected' : ''}" data-p="2">🟡 Media</button>
          <button class="priority-opt p-3 ${item.priority === 3 ? 'selected' : ''}" data-p="3">🟢 Baja</button>
        </div>
      </div>
      <div class="panel-field"><label>Fechas</label><div style="display:flex;gap:8px;"><input id="tl-edit-fi" type="date" value="${item.fecha_inicio || ''}" style="flex:1;"><input id="tl-edit-ff" type="date" value="${item.fecha_fin || ''}" style="flex:1;"></div></div>
      <div class="panel-field"><label>Contenido (Markdown)</label>
        <button class="btn btn-secondary" id="tl-edit-md-help" style="font-size:11px;padding:3px 8px;margin-bottom:4px;">? MD</button>
        <textarea id="tl-edit-content" style="width:100%;min-height:150px;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:13px;resize:vertical;">${this.esc(item.content || '')}</textarea>
      </div>
    `;
  }

  attachEditEvents(item) {
    document.getElementById('tl-edit-md-help')?.addEventListener('click', () => {
      document.getElementById('modal-md').classList.add('open');
    });

    document.getElementById('tl-edit-save')?.addEventListener('click', () => {
      const title = document.getElementById('tl-edit-title')?.value.trim();
      if (!title) { alert('El título es obligatorio'); return; }
      const selPri = document.querySelector('#detail-panel .priority-opt.selected');
      item.title = title;
      item.priority = parseInt(selPri?.dataset.p || '2');
      item.fecha_inicio = document.getElementById('tl-edit-fi')?.value || '';
      item.fecha_fin = document.getElementById('tl-edit-ff')?.value || '';
      item.content = document.getElementById('tl-edit-content')?.value || '';
      this.store.update(item);
      this.openDetail(item);
    });

    document.getElementById('tl-edit-cancel')?.addEventListener('click', () => {
      this.openDetail(item);
    });
  }

  groupByDay(items) {
    const map = new Map();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const item of items) {
      const d = new Date(item.fecha_inicio);
      d.setHours(0, 0, 0, 0);
      const key = d.getTime();
      if (!map.has(key)) map.set(key, { date: d, items: [] });
      map.get(key).items.push(item);
    }

    return Array.from(map.values())
      .sort((a, b) => a.date - b.date)
      .map(day => {
        day.items.sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2));
        day.isToday = day.date.getTime() === today.getTime();
        day.isPast = day.date < today;
        return day;
      });
  }

  renderDay(day) {
    const dateStr = this.formatDate(day.date);
    const dayClass = day.isToday ? 'today' : day.isPast ? 'past' : '';

    return `
      <div class="timeline-day ${dayClass}">
        <div class="timeline-day-marker"></div>
        <div class="timeline-day-header">${dateStr} ${day.isToday ? '(Hoy)' : ''}</div>
        <div class="timeline-cards">
          ${day.items.map(item => this.renderCard(item)).join('')}
        </div>
      </div>
    `;
  }

  renderCard(item) {
    const countdown = this.getCountdown(item.fecha_inicio);
    const countdownClass = countdown.urgent ? 'urgent' : countdown.soon ? 'soon' : 'later';
    const typeLabel = item.type === 'task' ? 'Tarea' : 'Evento';
    const isPast = new Date(item.fecha_inicio) < new Date(new Date().toDateString());
    const tags = item.tags?.length
      ? item.tags.map(t => `<span class="tag tag-clickable" style="font-size:9px;padding:1px 4px;">${this.esc(t)}</span>`).join('')
      : '';

    return `
      <div class="timeline-card ${isPast ? 'past' : ''}" data-id="${item.id}">
        <div class="timeline-card-priority p-${item.priority ?? 2}"></div>
        <div class="timeline-card-body">
          <div class="timeline-card-title">${this.esc(item.title)}</div>
          <div class="timeline-card-meta">
            <span class="timeline-card-tag ${item.type}">${typeLabel}</span>
            <span class="timeline-card-date">${this.formatTime(item.fecha_inicio)}</span>
            ${tags ? `<span style="display:flex;gap:2px;flex-wrap:wrap;">${tags}</span>` : ''}
            ${item.content ? `<span class="timeline-card-date">${this.esc(item.content.slice(0, 60))}</span>` : ''}
          </div>
        </div>
        <div class="timeline-card-countdown ${countdownClass}">${countdown.text}</div>
      </div>
    `;
  }

  getCountdown(dateStr) {
    const now = new Date();
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    const diff = target.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return { text: 'Atrasado', urgent: true, soon: false };
    if (days === 0) return { text: 'Hoy', urgent: true, soon: false };
    if (days === 1) return { text: 'Mañana', urgent: true, soon: false };
    if (days <= 3) return { text: `En ${days} días`, urgent: false, soon: true };
    if (days <= 7) return { text: `En ${days} días`, urgent: false, soon: true };
    if (days <= 30) return { text: `En ${days} días`, urgent: false, soon: false };
    const months = Math.floor(days / 30);
    return { text: `En ${months} mes${months > 1 ? 'es' : ''}`, urgent: false, soon: false };
  }

  formatDate(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = date.getTime() - today.getTime();
    const days = Math.round(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Hoy';
    if (days === 1) return 'Mañana';
    if (days === -1) return 'Ayer';
    if (days > 0 && days <= 6) {
      const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      return weekdays[date.getDay()];
    }
    return date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  formatTime(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
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

  startClock() {
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      this.render();
    }, 60000);
  }

  destroy() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  emptyState() {
    return `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      <h3>No hay eventos en el timeline</h3>
      <p>Creá tareas o eventos con fecha de inicio para verlos aquí</p>
    </div>`;
  }

  esc(s) {
    if (typeof s !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
}
