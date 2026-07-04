import * as clipboard from '../clipboard.js';
import { todayLocalStr, parseLocalDate, esc, renderMarkdown } from '../helpers.js';

export class FinanzaView {
  constructor(store, form, onTagClick) {
    this.store = store;
    this.form = form;
    this.onTagClick = onTagClick;
    this.container = document.getElementById('view-finanzas');
    this._delegateEvents();
    this.render();
  }

  render() {
    const suscripciones = this.store.items.filter(i => i.type === 'suscripcion' && i.estado === 'activa')
      .sort((a, b) => (a.fecha_inicio || '').localeCompare(b.fecha_inicio || ''));
    const ahorros = this.store.items.filter(i => i.type === 'ahorro');
    const totales = this.store.getTotalesMes();
    const gastosCount = this.store.items.filter(i => i.type === 'gasto' && !this.store._isGastoChild(i)).length;

    let html = `<div class="fz-wrapper">`;

    html += this.renderResumen(totales);
    html += this.renderSuscripciones(suscripciones);
    html += this.renderGastos();
    html += this.renderAhorros(ahorros);

    if (suscripciones.length === 0 && gastosCount === 0 && ahorros.length === 0) {
      html += this.emptyState();
    }

    html += `</div>`;
    this.container.innerHTML = html;
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
            <div class="fz-row-title">${esc(item.title)}</div>
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

  renderGastos() {
    const allGastos = this.store.items.filter(i => i.type === 'gasto');
    const childrenByParent = new Map();
    const roots = [];
    for (const g of allGastos) {
      const parent = this.store.getById(g.parent_id);
      if (g.parent_id && parent?.type === 'gasto') {
        if (!childrenByParent.has(g.parent_id)) childrenByParent.set(g.parent_id, []);
        childrenByParent.get(g.parent_id).push(g);
      } else {
        roots.push(g);
      }
    }
    roots.sort((a, b) => (b.fecha_inicio || '').localeCompare(a.fecha_inicio || ''));
    for (const [, kids] of childrenByParent) {
      kids.sort((a, b) => (b.fecha_inicio || '').localeCompare(a.fecha_inicio || ''));
    }

    let html = `<div class="fz-section"><h3 class="fz-section-title">Gastos recientes (${roots.length})</h3><div class="fz-list">`;
    let count = 0;
    for (const root of roots) {
      if (count >= 20) break;
      html += this._gastoRow(root, false);
      count++;
      const kids = childrenByParent.get(root.id) || [];
      for (const kid of kids) {
        if (count >= 20) break;
        html += this._gastoRow(kid, true);
        count++;
      }
    }
    html += `</div></div>`;
    return html;
  }

  _gastoRow(item, indent) {
    const pagado = item.estado === 'pagado';
    const tags = item.tags?.length
      ? item.tags.map(t => `<span class="fz-tag tag-clickable" data-tag="${esc(t)}">${esc(t)}</span>`).join('')
      : '';
    const prefix = indent ? `<span style="color:var(--text-muted);margin-right:6px;">↳</span>` : '';
    const marginLeft = indent ? 'margin-left:24px;' : '';
    return `
      <div class="fz-row ${pagado ? 'pagado' : ''}" data-id="${item.id}" style="${marginLeft}">
        <div class="fz-row-body" data-id="${item.id}" style="cursor:pointer;flex:1;">
          <div class="fz-row-title">${prefix}${pagado ? '✅ ' : ''}${esc(item.title)}</div>
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

  renderAhorros(items) {
    if (items.length === 0) return '';
    let html = `<div class="fz-section"><h3 class="fz-section-title">Ahorros</h3><div class="fz-list">`;
    for (const item of items) {
      const pct = item.meta > 0 ? Math.min(100, Math.round((item.acumulado || 0) / item.meta * 100)) : 0;
      html += `
        <div class="fz-row" data-id="${item.id}">
          <div class="fz-row-body" data-id="${item.id}" style="cursor:pointer;flex:1;">
            <div class="fz-row-title">${esc(item.title)}</div>
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

  _delegateEvents() {
    this.container.addEventListener('click', (e) => {
      const tag = e.target.closest('.tag-clickable');
      if (tag && this.onTagClick) {
        this.onTagClick(tag.dataset.tag);
        return;
      }

      const payBtn = e.target.closest('.fz-pay-btn');
      if (payBtn) {
        const item = this.store.getById(payBtn.dataset.id);
        if (!item) return;
        const children = this.store.getChildren(item.id).filter(c => c.type === 'gasto' && c.estado !== 'pagado');
        const msg = children.length > 0
          ? `¿Pagar ${esc(item.title)} - $${this.fmt(item.monto)} (${children.length} producto${children.length > 1 ? 's' : ''} incluido${children.length > 1 ? 's' : ''})?`
          : `¿Pagar ${esc(item.title)} - $${this.fmt(item.monto)}?`;
        if (confirm(msg)) {
          if (item.type === 'gasto') {
            item.estado = 'pagado';
            item.updated = Date.now();
            this.store.update(item);
            for (const child of children) {
              child.estado = 'pagado';
              child.updated = Date.now();
              this.store.update(child);
            }
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

    const panel = document.getElementById('detail-panel');
    panel.addEventListener('click', (e) => {
      const tag = e.target.closest('.tag-clickable');
      if (tag && this.onTagClick) {
        this.onTagClick(tag.dataset.tag);
        return;
      }

      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.id;

      const item = this._currentDetailItem;
      if (!item) return;
      const body = document.getElementById('panel-body');
      const actions = document.getElementById('panel-actions');

      if (id === 'fz-detail-edit') {
        body.innerHTML = this.renderDetailEdit(item);
        actions.innerHTML = `
          <button class="btn btn-primary" id="fz-edit-save">Guardar</button>
          <button class="btn btn-secondary" id="fz-edit-cancel">Cancelar</button>
          <div style="flex:1"></div>
          <button class="btn btn-secondary" id="fz-edit-cut">✂ Cortar</button>
        `;
        return;
      }

      if (id === 'fz-detail-delete') {
        if (confirm('¿Eliminar este elemento?')) {
          this.store.delete(item.id);
          panel.classList.remove('open');
          this.render();
        }
        return;
      }

      if (id === 'fz-detail-paste') {
        if (clipboard.getCutCount() === 0) return;
        clipboard.pasteAll(item.id);
        panel.classList.remove('open');
        this.render();
        return;
      }

      if (id === 'fz-edit-save') {
        this._saveDetailEdit();
        return;
      }

      if (id === 'fz-edit-cancel') {
        this.openDetail(item);
        return;
      }

      if (id === 'fz-edit-cut') {
        clipboard.cutItem(item.id);
        this.openDetail(item);
        return;
      }

      if (id === 'fz-detail-pay') {
        this.store.paySubscription(item);
        this.openDetail(item);
        return;
      }

      if (id === 'fz-edit-md-help') {
        document.getElementById('modal-md').classList.add('open');
        return;
      }
    });
  }

  _saveDetailEdit() {
    const item = this._currentDetailItem;
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
  }

  openDetail(item) {
    this._currentDetailItem = item;
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
  }

  renderDetail(item) {
    const tags = item.tags?.length
      ? item.tags.map(t => `<span class="tag tag-clickable" data-tag="${esc(t)}">${esc(t)}</span>`).join('')
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
    } else if (item.type === 'gasto') {
      const kids = (this.store.getChildren(item.id) || []).filter(c => c.type === 'gasto');
      const childrenHtml = kids.length > 0 ? `
        <div class="panel-field"><label>Productos</label>
        <table class="fz-prod-table">
          <thead><tr><th>Producto</th><th>Cant.</th><th>P.U.</th><th>Subtotal</th></tr></thead>
          <tbody>${kids.map(k => {
            const subtotal = (k.cantidad || 1) * (k.precio_unitario || 0);
            return `<tr>
              <td>${esc(k.title)}</td>
              <td style="text-align:center;">${k.cantidad || 1}</td>
              <td style="text-align:right;">$${this.fmt(k.precio_unitario || 0)}</td>
              <td style="text-align:right;font-weight:600;">$${this.fmt(subtotal)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>` : '';
      extra = `
        <div class="panel-field"><label>Monto</label><div style="font-weight:600;font-size:18px;">$${this.fmt(item.monto)}</div></div>
        <div class="panel-field"><label>Fecha</label><div class="panel-value-date">${item.fecha_inicio ? parseLocalDate(item.fecha_inicio).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</div></div>
        ${childrenHtml}
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
      <div class="panel-field"><label>Título</label><div class="panel-value-title">${esc(item.title)}</div></div>
      ${extra}
      <div class="panel-field"><label>Tags</label><div class="panel-value-tags">${tags}</div></div>
      <div class="panel-field"><label>Notas</label><div class="markdown-preview">${renderMarkdown(item.content || '')}</div></div>
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
      const kids = (this.store.getChildren(item.id) || []).filter(c => c.type === 'gasto');
      extraFields += `
        <div class="panel-field"><label>Fecha</label><input id="fz-edit-fecha" type="date" value="${item.fecha_inicio || ''}"></div>
        <div class="panel-field"><label>Estado</label>
          <select id="fz-edit-estado">
            <option value="pendiente" ${item.estado === 'pendiente' || !item.estado ? 'selected' : ''}>Pendiente</option>
            <option value="pagado" ${item.estado === 'pagado' ? 'selected' : ''}>Pagado</option>
          </select>
        </div>`;
      if (kids.length > 0) {
        extraFields += `<div class="panel-field"><label>Productos (${kids.length})</label><div style="font-size:12px;color:var(--text-secondary);">${kids.map(k => `${esc(k.title)} ($${this.fmt(k.monto)})`).join(', ')}</div></div>`;
      }
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
      <div class="panel-field"><label>Título</label><input id="fz-edit-title" type="text" value="${esc(item.title)}"></div>
      ${extraFields}
      <div class="panel-field"><label>Tags</label><input id="fz-edit-tags" type="text" value="${(item.tags || []).join(', ')}" placeholder="tag1, tag2, ..."></div>
      <div class="panel-field"><label>Notas</label>
        <button class="btn btn-secondary" id="fz-edit-md-help" style="font-size:11px;padding:3px 8px;margin-bottom:4px;">? MD</button>
        <textarea id="fz-edit-content">${esc(item.content || '')}</textarea>
      </div>
    `;
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

  fmt(n) {
    return Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  emptyState() {
    return `<div class="empty-state">
      <h3>Sin movimientos</h3>
      <p>Agrega suscripciones, gastos o metas de ahorro</p>
    </div>`;
  }

}
