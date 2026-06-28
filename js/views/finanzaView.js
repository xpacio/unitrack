import * as clipboard from '../clipboard.js';
import { todayLocalStr, parseLocalDate } from '../helpers.js';

export class FinanzaView {
  constructor(store, form, onTagClick) {
    this.store = store;
    this.form = form;
    this.onTagClick = onTagClick;
    this.container = document.getElementById('view-finanzas');
    this.render();
  }

  render() {
    const suscripciones = this.store.items.filter(i => i.type === 'suscripcion' && i.estado === 'activa')
      .sort((a, b) => (a.fecha_inicio || '').localeCompare(b.fecha_inicio || ''));
    const gastos = this.store.items.filter(i => i.type === 'gasto')
      .sort((a, b) => (b.fecha_inicio || '').localeCompare(a.fecha_inicio || ''));
    const ahorros = this.store.items.filter(i => i.type === 'ahorro');
    const totales = this.store.getTotalesMes();

    let html = `<div class="fz-wrapper">`;

    html += this.renderResumen(totales);
    html += this.renderSuscripciones(suscripciones);
    html += this.renderGastos(gastos);
    html += this.renderAhorros(ahorros);

    if (suscripciones.length === 0 && gastos.length === 0 && ahorros.length === 0) {
      html += this.emptyState();
    }

    html += `</div>`;
    this.container.innerHTML = html;
    this.attachEvents();
  }

  renderResumen(totales) {
    return `
      <div class="fz-resumen">
        <h2 class="fz-section-title">Resumen del mes</h2>
        <div class="fz-cards">
          <div class="fz-card">
            <span class="fz-card-label">Suscripciones</span>
            <span class="fz-card-value">$${this.fmt(totales.totalSusc)}/mes</span>
          </div>
          <div class="fz-card">
            <span class="fz-card-label">Gastos</span>
            <span class="fz-card-value">$${this.fmt(totales.totalGastos)}
              <span class="fz-card-diff ${totales.diff >= 0 ? 'up' : 'down'}">${totales.diff >= 0 ? '↑' : '↓'} ${Math.abs(totales.diff)}%</span>
            </span>
          </div>
          <div class="fz-card">
            <span class="fz-card-label">Ahorrado</span>
            <span class="fz-card-value ahorro">$${this.fmt(totales.totalAhorrado)}</span>
          </div>
          <div class="fz-card total">
            <span class="fz-card-label">Total gastos</span>
            <span class="fz-card-value">$${this.fmt(totales.totalGastos + totales.totalSusc)}</span>
          </div>
        </div>
      </div>`;
  }

  renderSuscripciones(items) {
    if (items.length === 0) return '';
    const hoy = todayLocalStr();
    let html = `<div class="fz-section"><h3 class="fz-section-title">Suscripciones activas (${items.length})</h3><div class="fz-list">`;
    for (const item of items) {
      const vencida = item.fecha_inicio && item.fecha_inicio <= hoy;
      html += `
        <div class="fz-row ${vencida ? 'vencida' : ''}" data-id="${item.id}">
          <div class="fz-row-body" data-id="${item.id}" style="cursor:pointer;flex:1;">
            <div class="fz-row-title">${this.esc(item.title)}</div>
            <div class="fz-row-meta">
              <span class="fz-row-amount">$${this.fmt(item.monto)}/${item.periodicidad || '?'}</span>
              <span class="fz-row-date">${item.fecha_inicio ? parseLocalDate(item.fecha_inicio).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : '—'} ${vencida ? '⏰ Vencida' : this.countdown(item.fecha_inicio)}</span>
            </div>
          </div>
          ${vencida ? `<button class="btn btn-primary fz-pay-btn" data-id="${item.id}">Pagar</button>` : ''}
        </div>`;
    }
    html += `</div></div>`;
    return html;
  }

  renderGastos(items) {
    if (items.length === 0) return '';
    let html = `<div class="fz-section"><h3 class="fz-section-title">Gastos recientes</h3><div class="fz-list">`;
    for (const item of items.slice(0, 20)) {
      const pagado = item.estado === 'pagado';
      const tags = item.tags?.length
        ? item.tags.map(t => `<span class="fz-tag tag-clickable" data-tag="${this.esc(t)}">${this.esc(t)}</span>`).join('')
        : '';
      html += `
        <div class="fz-row ${pagado ? 'pagado' : ''}" data-id="${item.id}">
          <div class="fz-row-body" data-id="${item.id}" style="cursor:pointer;flex:1;">
            <div class="fz-row-title">${pagado ? '✅ ' : ''}${this.esc(item.title)}</div>
            <div class="fz-row-meta">
              <span class="fz-row-amount">$${this.fmt(item.monto)}</span>
              <span class="fz-row-date">${item.fecha_inicio ? parseLocalDate(item.fecha_inicio).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : '—'}</span>
              ${pagado ? '<span class="fz-badge pagado">Pagado</span>' : ''}
              ${tags}
            </div>
          </div>
          ${!pagado ? `<button class="btn btn-primary fz-pay-btn" data-id="${item.id}">✓ Pagar</button>` : ''}
        </div>`;
    }
    html += `</div></div>`;
    return html;
  }

  renderAhorros(items) {
    if (items.length === 0) return '';
    let html = `<div class="fz-section"><h3 class="fz-section-title">Ahorros</h3><div class="fz-list">`;
    for (const item of items) {
      const pct = item.meta > 0 ? Math.min(100, Math.round((item.acumulado || 0) / item.meta * 100)) : 0;
      html += `
        <div class="fz-row" data-id="${item.id}">
          <div class="fz-row-body" data-id="${item.id}" style="cursor:pointer;flex:1;">
            <div class="fz-row-title">${this.esc(item.title)}</div>
            <div class="fz-row-meta" style="margin-bottom:4px;">
              <span class="fz-row-amount">$${this.fmt(item.acumulado || 0)} / $${this.fmt(item.meta)}</span>
              <span class="fz-row-date">${pct}%</span>
            </div>
            <div class="fz-bar">
              <div class="fz-bar-fill" style="width:${pct}%"></div>
            </div>
          </div>
        </div>`;
    }
    html += `</div></div>`;
    return html;
  }

  attachEvents() {
    this.container.addEventListener('click', (e) => {
      const tag = e.target.closest('.tag-clickable');
      if (tag && this.onTagClick) {
        this.onTagClick(tag.dataset.tag);
        return;
      }

      const payBtn = e.target.closest('.fz-pay-btn');
      if (payBtn) {
        const item = this.store.getById(payBtn.dataset.id);
        if (item && confirm(`¿Pagar ${this.esc(item.title)} - $${item.monto}?`)) {
          if (item.type === 'gasto') {
            item.estado = 'pagado';
            item.updated = Date.now();
            this.store.update(item);
          } else {
            this.store.paySubscription(item);
          }
          this.render();
        }
        return;
      }

      const row = e.target.closest('.fz-row-body');
      if (row) {
        const item = this.store.getById(row.dataset.id);
        if (item) this.openDetail(item);
      }
    });
  }

  openDetail(item) {
    const panel = document.getElementById('detail-panel');
    const body = document.getElementById('panel-body');
    const title = document.getElementById('panel-title');
    const actions = document.getElementById('panel-actions');
    document.getElementById('panel-close').onclick = () => panel.classList.remove('open');

    title.textContent = item.type === 'suscripcion' ? 'Suscripción'
      : item.type === 'gasto' ? 'Gasto'
      : item.type === 'ahorro' ? 'Ahorro'
      : 'Detalle';

    body.innerHTML = this.renderDetail(item);
    const pegCnt = clipboard.getCutCount();
    actions.innerHTML = `
      <button class="btn btn-secondary" id="fz-detail-edit">✎ Editar</button>
      <button class="btn btn-danger" id="fz-detail-delete">🗑 Eliminar</button>
      ${pegCnt > 0 ? `<button class="btn btn-secondary" id="fz-detail-paste">📄 Pegar ${pegCnt}</button>` : ''}
    `;
    panel.classList.add('open');

    body.querySelectorAll('.tag-clickable').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onTagClick) this.onTagClick(el.dataset.tag);
      });
    });

    actions.querySelector('#fz-detail-edit')?.addEventListener('click', () => {
      body.innerHTML = this.renderDetailEdit(item);
      actions.innerHTML = `
        <button class="btn btn-primary" id="fz-edit-save">Guardar</button>
        <button class="btn btn-secondary" id="fz-edit-cancel">Cancelar</button>
        <div style="flex:1"></div>
        <button class="btn btn-secondary" id="fz-edit-cut">✂ Cortar</button>
      `;
      this.attachEditEvents(item);
    });

    actions.querySelector('#fz-detail-delete')?.addEventListener('click', () => {
      if (confirm('¿Eliminar este elemento?')) {
        this.store.delete(item.id);
        panel.classList.remove('open');
        this.render();
      }
    });

    actions.querySelector('#fz-detail-paste')?.addEventListener('click', () => {
      if (clipboard.getCutCount() === 0) return;
      clipboard.pasteAll(item.id);
      document.getElementById('detail-panel').classList.remove('open');
      this.render();
    });
  }

  renderDetail(item) {
    const tags = item.tags?.length
      ? item.tags.map(t => `<span class="tag tag-clickable" data-tag="${this.esc(t)}">${this.esc(t)}</span>`).join('')
      : 'Sin tags';

    let extra = '';
    if (item.type === 'suscripcion') {
      const hoy = todayLocalStr();
      const vencida = item.fecha_inicio && item.fecha_inicio <= hoy;
      extra = `
        <div class="panel-field"><label>Monto</label><div style="font-weight:600;font-size:18px;">$${this.fmt(item.monto)}</div></div>
        <div class="panel-field"><label>Periodicidad</label><div>${item.periodicidad === 'bimestral' ? 'Bimestral' : 'Mensual'}</div></div>
        <div class="panel-field"><label>Próximo pago</label><div style="color:${vencida ? 'var(--danger)' : 'var(--text-secondary)'};font-weight:${vencida ? '600' : '400'};">${item.fecha_inicio ? parseLocalDate(item.fecha_inicio).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'} ${vencida ? '⏰ Vencida' : ''}</div></div>
        ${vencida ? `<div style="margin-top:12px;"><button class="btn btn-primary" id="fz-detail-pay" style="width:100%;">Pagar $${this.fmt(item.monto)}</button></div>` : ''}
      `;
      if (vencida) {
        setTimeout(() => {
          document.getElementById('fz-detail-pay')?.addEventListener('click', () => {
            this.store.paySubscription(item);
            this.openDetail(item);
          });
        }, 0);
      }
    } else if (item.type === 'gasto') {
      extra = `
        <div class="panel-field"><label>Monto</label><div style="font-weight:600;font-size:18px;">$${this.fmt(item.monto)}</div></div>
        <div class="panel-field"><label>Fecha</label><div class="panel-value-date">${item.fecha_inicio ? parseLocalDate(item.fecha_inicio).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</div></div>
      `;
    } else if (item.type === 'ahorro') {
      const pct = item.meta > 0 ? Math.min(100, Math.round((item.acumulado || 0) / item.meta * 100)) : 0;
      extra = `
        <div class="panel-field"><label>Meta</label><div style="font-weight:600;font-size:18px;">$${this.fmt(item.meta)}</div></div>
        <div class="panel-field"><label>Acumulado</label><div style="font-weight:600;font-size:18px;color:var(--success);">$${this.fmt(item.acumulado || 0)}</div></div>
        <div class="panel-field"><label>Progreso</label>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="fz-bar" style="flex:1;"><div class="fz-bar-fill" style="width:${pct}%"></div></div>
            <span style="font-weight:600;font-size:14px;">${pct}%</span>
          </div>
        </div>
      `;
    }

    return `
      <div class="panel-field"><label>Título</label><div class="panel-value-title">${this.esc(item.title)}</div></div>
      ${extra}
      <div class="panel-field"><label>Tags</label><div class="panel-value-tags">${tags}</div></div>
      <div class="panel-field"><label>Notas</label><div class="markdown-preview">${this.renderMarkdown(item.content || '')}</div></div>
    `;
  }

  renderDetailEdit(item) {
    let extraFields = '';
    if (item.type === 'suscripcion' || item.type === 'gasto' || item.type === 'ahorro') {
      extraFields += `
        <div class="panel-field"><label>Monto</label>
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="font-size:16px;font-weight:600;color:var(--text-secondary);">$</span>
            <input id="fz-edit-monto" type="number" step="0.01" min="0" value="${item.monto || 0}" style="flex:1;">
          </div>
        </div>`;
    }
    if (item.type === 'suscripcion') {
      extraFields += `
        <div class="panel-field"><label>Periodicidad</label>
          <select id="fz-edit-periodicidad">
            <option value="mensual" ${item.periodicidad === 'mensual' ? 'selected' : ''}>Mensual</option>
            <option value="bimestral" ${item.periodicidad === 'bimestral' ? 'selected' : ''}>Bimestral</option>
          </select>
        </div>
        <div class="panel-field"><label>Próximo pago</label><input id="fz-edit-fecha" type="date" value="${item.fecha_inicio || ''}"></div>
        <div class="panel-field"><label>Estado</label>
          <select id="fz-edit-estado">
            <option value="activa" ${item.estado === 'activa' ? 'selected' : ''}>Activa</option>
            <option value="pausada" ${item.estado === 'pausada' ? 'selected' : ''}>Pausada</option>
            <option value="cancelada" ${item.estado === 'cancelada' ? 'selected' : ''}>Cancelada</option>
          </select>
        </div>`;
    }
    if (item.type === 'gasto') {
      extraFields += `
        <div class="panel-field"><label>Fecha</label><input id="fz-edit-fecha" type="date" value="${item.fecha_inicio || ''}"></div>
        <div class="panel-field"><label>Estado</label>
          <select id="fz-edit-estado">
            <option value="pendiente" ${item.estado === 'pendiente' || !item.estado ? 'selected' : ''}>Pendiente</option>
            <option value="pagado" ${item.estado === 'pagado' ? 'selected' : ''}>Pagado</option>
          </select>
        </div>`;
    }
    if (item.type === 'ahorro') {
      extraFields += `
        <div class="panel-field"><label>Meta</label>
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="font-size:16px;font-weight:600;color:var(--text-secondary);">$</span>
            <input id="fz-edit-meta" type="number" step="0.01" min="0" value="${item.meta || 0}" style="flex:1;">
          </div>
        </div>
        <div class="panel-field"><label>Acumulado</label>
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="font-size:16px;font-weight:600;color:var(--text-secondary);">$</span>
            <input id="fz-edit-acumulado" type="number" step="0.01" min="0" value="${item.acumulado || 0}" style="flex:1;">
          </div>
        </div>`;
    }

    return `
      <div class="panel-field"><label>Título</label><input id="fz-edit-title" type="text" value="${this.esc(item.title)}"></div>
      ${extraFields}
      <div class="panel-field"><label>Tags</label><input id="fz-edit-tags" type="text" value="${(item.tags || []).join(', ')}" placeholder="tag1, tag2, ..."></div>
      <div class="panel-field"><label>Notas</label>
        <button class="btn btn-secondary" id="fz-edit-md-help" style="font-size:11px;padding:3px 8px;margin-bottom:4px;">? MD</button>
        <textarea id="fz-edit-content">${this.esc(item.content || '')}</textarea>
      </div>
    `;
  }

  attachEditEvents(item) {
    document.getElementById('fz-edit-md-help')?.addEventListener('click', () => {
      document.getElementById('modal-md').classList.add('open');
    });

    document.getElementById('fz-edit-save')?.addEventListener('click', () => {
      const title = document.getElementById('fz-edit-title')?.value.trim();
      if (!title) { alert('El título es obligatorio'); return; }
      item.title = title;
      item.content = document.getElementById('fz-edit-content')?.value || '';
      const tagsRaw = document.getElementById('fz-edit-tags')?.value || '';
      item.tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

      if (item.type === 'suscripcion' || item.type === 'gasto' || item.type === 'ahorro') {
        item.monto = parseFloat(document.getElementById('fz-edit-monto')?.value) || 0;
      }
      if (item.type === 'suscripcion') {
        item.periodicidad = document.getElementById('fz-edit-periodicidad')?.value || 'mensual';
        item.fecha_inicio = document.getElementById('fz-edit-fecha')?.value || '';
        item.estado = document.getElementById('fz-edit-estado')?.value || 'activa';
      }
      if (item.type === 'gasto') {
        item.fecha_inicio = document.getElementById('fz-edit-fecha')?.value || '';
        item.estado = document.getElementById('fz-edit-estado')?.value || 'pendiente';
      }
      if (item.type === 'ahorro') {
        item.meta = parseFloat(document.getElementById('fz-edit-meta')?.value) || 0;
        item.acumulado = parseFloat(document.getElementById('fz-edit-acumulado')?.value) || 0;
      }

      this.store.update(item);
      this.openDetail(item);
    });

    document.getElementById('fz-edit-cancel')?.addEventListener('click', () => {
      this.openDetail(item);
    });

    document.getElementById('fz-edit-cut')?.addEventListener('click', () => {
      clipboard.cutItem(item.id);
      this.openDetail(item);
    });
  }

  countdown(dateStr) {
    if (!dateStr) return '';
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const target = parseLocalDate(dateStr);
    const diff = Math.ceil((target - hoy) / 86400000);
    if (diff < 0) return '';
    if (diff === 0) return '🔴 Hoy';
    if (diff === 1) return '🟡 Mañana';
    if (diff <= 7) return `🟠 En ${diff} días`;
    return `📅 En ${diff} días`;
  }

  renderMarkdown(text) {
    if (!text) return '<p style="color:var(--text-muted)"><em>Sin notas</em></p>';
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

  fmt(n) {
    return Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  emptyState() {
    return `<div class="empty-state">
      <h3>Sin movimientos</h3>
      <p>Agrega suscripciones, gastos o metas de ahorro</p>
    </div>`;
  }

  esc(s) {
    if (typeof s !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
}
