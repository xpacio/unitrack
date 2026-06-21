export class TimelineView {
  constructor(store, form) {
    this.store = store;
    this.form = form;
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

    this.container.querySelector('#tl-refresh')?.addEventListener('click', () => this.render());
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

    return `
      <div class="timeline-card ${isPast ? 'past' : ''}" data-id="${item.id}">
        <div class="timeline-card-priority p-${item.priority ?? 2}"></div>
        <div class="timeline-card-body">
          <div class="timeline-card-title">${this.esc(item.title)}</div>
          <div class="timeline-card-meta">
            <span class="timeline-card-tag ${item.type}">${typeLabel}</span>
            <span class="timeline-card-date">${this.formatTime(item.fecha_inicio)}</span>
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
