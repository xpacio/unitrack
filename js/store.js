export function createItem(data = {}) {
  const type = data.type || 'task';
  return {
    id: crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    type,
    title: data.title || '',
    content: data.content || '',
    parent_id: data.parent_id || null,
    tags: data.tags || [],
    priority: data.priority ?? (type === 'note' || type === 'carpeta' ? null : type === 'ahorro' ? null : 2),
    fecha_inicio: data.fecha_inicio || '',
    fecha_fin: data.fecha_fin || '',
    estado: data.estado || (type === 'note' || type === 'carpeta' ? null : type === 'suscripcion' ? 'activa' : 'pendiente'),
    monto: data.monto ?? 0,
    periodicidad: data.periodicidad || null,
    meta: data.meta ?? 0,
    acumulado: data.acumulado ?? 0,
    created: Date.now(),
    updated: Date.now(),
  };
}

export class Store {
  constructor(options = {}) {
    this.items = [];
    this._syncing = false;
    this._syncUrl = '/api/sync.php';
    this._pendingCount = 0;
    this._lastSyncAt = 0;
    this._online = navigator.onLine;
    this.load();
    if (this.items.length === 0 && !options.noSeed) this.seed();
    this.startAutoSync();
    this._initOnlineListeners();
  }

  _initOnlineListeners() {
    window.addEventListener('online', () => {
      this._online = true;
      this._dispatchStatus();
      this.sync();
    });
    window.addEventListener('offline', () => {
      this._online = false;
      this._dispatchStatus();
    });
  }

  _dispatchStatus() {
    window.dispatchEvent(new CustomEvent('sync-status-changed', {
      detail: this.getSyncStatus()
    }));
  }

  getSyncStatus() {
    return {
      syncing: this._syncing,
      pendingCount: this._pendingCount,
      online: this._online,
    };
  }

  load() {
    try {
      const raw = localStorage.getItem('unified_items');
      this.items = raw ? JSON.parse(raw) : [];
    } catch {
      this.items = [];
    }
  }

  save() {
    localStorage.setItem('unified_items', JSON.stringify(this.items));
  }

  clear() {
    this.items = [];
    this._lastSyncAt = 0;
    this._pendingCount = 0;
    localStorage.removeItem('unified_items');
    this._dispatchStatus();
  }

  getAll() {
    return this.items;
  }

  getById(id) {
    return this.items.find(i => i.id === id);
  }

  getByType(type) {
    return this.items.filter(i => i.type === type);
  }

  getChildren(parentId) {
    return this.items.filter(i => i.parent_id === parentId);
  }

  getAncestors(id) {
    const ancestors = [];
    let current = this.getById(id);
    while (current && current.parent_id) {
      const parent = this.getById(current.parent_id);
      if (parent) {
        ancestors.unshift(parent);
        current = parent;
      } else break;
    }
    return ancestors;
  }

  getDescendantIds(parentId) {
    const ids = [];
    const queue = [parentId];
    while (queue.length) {
      const pid = queue.shift();
      const kids = this.items.filter(i => i.parent_id === pid);
      for (const k of kids) {
        ids.push(k.id);
        queue.push(k.id);
      }
    }
    return ids;
  }

  add(item) {
    this.items.push(item);
    this.save();
    this._pendingCount++;
    this._dispatchStatus();
    this.sync();
  }

  update(item) {
    const idx = this.items.findIndex(i => i.id === item.id);
    if (idx === -1) return;
    item.updated = Date.now();
    this.items[idx] = item;
    this.save();
    this._pendingCount++;
    this._dispatchStatus();
    this.sync();
  }

  reparent(itemId, newParentId) {
    if (itemId === newParentId) throw new Error('No puedes pegar en sí mismo');
    const item = this.getById(itemId);
    if (!item) throw new Error('Elemento no encontrado');
    if (newParentId) {
      const descendants = this.getDescendantIds(itemId);
      if (descendants.includes(newParentId)) throw new Error('Crearía un ciclo');
      const parent = this.getById(newParentId);
      if (parent && parent.fecha_fin) {
        item.fecha_fin = parent.fecha_fin;
      }
    }
    item.parent_id = newParentId;
    item.updated = Date.now();
    this.items[this.items.findIndex(i => i.id === itemId)] = item;
    this.save();
    this._pendingCount++;
    this._dispatchStatus();
    this.sync();
  }

  delete(id) {
    const descIds = this.getDescendantIds(id);
    const allIds = [id, ...descIds];
    const deletedSet = new Map();
    for (const did of allIds) {
      deletedSet.set(did, { id: did });
    }
    this.items = this.items.filter(i => !allIds.includes(i.id));
    this.save();
    this._pendingCount++;
    this._dispatchStatus();
    this.sync();
  }

  async sync() {
    if (!navigator.onLine || this._syncing) return;
    this._syncing = true;
    this._dispatchStatus();
    try {
      const payload = this.items.map(i => ({...i}));
      const res = await fetch(this._syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items: payload, lastSync: this._lastSyncAt }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          window.dispatchEvent(new CustomEvent('auth-required'));
        }
        return;
      }
      const data = await res.json();
      if (!data.changes) return;

      for (const serverItem of data.changes) {
        const idx = this.items.findIndex(i => i.id === serverItem.id);
        if (idx !== -1) {
          this.items[idx] = serverItem;
        } else {
          this.items.push(serverItem);
        }
      }

      if (data.serverTime) {
        this._lastSyncAt = data.serverTime;
      }

      this._pendingCount = 0;
      this.save();
    } catch {
      // silent fail — offline
    } finally {
      this._syncing = false;
      this._dispatchStatus();
    }
  }

  startAutoSync() {
    if (this._syncInterval) clearInterval(this._syncInterval);
    this.sync();
    this._syncInterval = setInterval(() => this.sync(), 30000);
  }

  destroy() {
    if (this._syncInterval) {
      clearInterval(this._syncInterval);
      this._syncInterval = null;
    }
  }

  getTree(type) {
    const items = type ? this.items.filter(i => i.type === type) : [...this.items];
    const roots = items.filter(i => !i.parent_id);
    const map = new Map(items.map(i => [i.id, { ...i, children: [] }]));
    const tree = [];
    for (const item of items) {
      const node = map.get(item.id);
      if (item.parent_id && map.has(item.parent_id)) {
        map.get(item.parent_id).children.push(node);
      } else if (!item.parent_id) {
        tree.push(node);
      }
    }
    return tree;
  }

  getTimelineItems() {
    return this.items
      .filter(i => i.fecha_inicio && (i.type === 'task' || i.type === 'event' || i.type === 'suscripcion' || i.type === 'gasto'))
      .sort((a, b) => {
        const da = new Date(a.fecha_inicio);
        const db = new Date(b.fecha_inicio);
        if (da - db !== 0) return da - db;
        return (a.priority ?? 2) - (b.priority ?? 2);
      });
  }

  search(query) {
    const q = query.toLowerCase();
    return this.items.filter(i =>
      i.title.toLowerCase().includes(q) ||
      (i.content && i.content.toLowerCase().includes(q)) ||
      (i.tags && i.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  getByTag(tag) {
    return this.items.filter(i => i.tags && i.tags.some(t => t.toLowerCase() === tag.toLowerCase()));
  }

  getAllTags() {
    const set = new Set();
    for (const item of this.items) {
      if (item.tags) item.tags.forEach(t => set.add(t));
    }
    return Array.from(set).sort();
  }

  paySubscription(item) {
    const gasto = createItem({
      type: 'gasto',
      title: `${item.title} - Pago`,
      content: `Pago de suscripción ${item.title} - $${item.monto}`,
      monto: item.monto,
      fecha_inicio: new Date().toISOString().slice(0, 10),
      tags: [...(item.tags || [])],
    });
    this.add(gasto);

    const advance = item.periodicidad === 'bimestral' ? 60 : 30;
    const next = new Date(item.fecha_inicio);
    next.setDate(next.getDate() + advance);
    item.fecha_inicio = next.toISOString().slice(0, 10);
    item.updated = Date.now();
    this.update(item);

    return gasto;
  }

  getTotalesMes() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const gastosMes = this.items.filter(i =>
      i.type === 'gasto' && i.fecha_inicio >= monthStart
    );
    const totalGastos = gastosMes.reduce((s, i) => s + (i.monto || 0), 0);
    const suscripciones = this.items.filter(i => i.type === 'suscripcion' && i.estado === 'activa');
    const totalSusc = suscripciones.reduce((s, i) => s + (i.monto || 0), 0);
    const ahorros = this.items.filter(i => i.type === 'ahorro');
    const totalAhorrado = ahorros.reduce((s, i) => s + (i.acumulado || 0), 0);

    const mesAnt = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const mesAntFin = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
    const gastosMesAnt = this.items.filter(i =>
      i.type === 'gasto' && i.fecha_inicio >= mesAnt && i.fecha_inicio <= mesAntFin
    );
    const totalAnt = gastosMesAnt.reduce((s, i) => s + (i.monto || 0), 0);
    const diff = totalAnt > 0 ? Math.round((totalGastos - totalAnt) / totalAnt * 100) : 0;

    return { totalGastos, totalSusc, totalAhorrado, diff };
  }

  getNextPrioritySibling(parentId) {
    const siblings = this.getChildren(parentId).filter(i => i.type === 'task');
    if (siblings.length === 0) return null;
    return siblings.reduce((a, b) => (a.priority ?? 2) < (b.priority ?? 2) ? a : b);
  }

  seed() {
    const batch = [];
    const add = (data) => {
      const item = createItem(data);
      batch.push(item);
      return item.id;
    };

    const carpetaDesarrollo = add({ type: 'carpeta', title: 'Desarrollo', content: 'Tareas y notas de desarrollo del proyecto', tags: ['dev'] });
    const carpetaDiseno = add({ type: 'carpeta', title: 'Diseño UI', content: 'Todo lo relacionado a diseño de interfaz', tags: ['diseño', 'ui'] });

    const root1 = add({ type: 'task', title: 'Lanzar MVP', content: 'Plan de lanzamiento de la versión inicial', parent_id: carpetaDesarrollo, priority: 1, fecha_inicio: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), estado: 'en_curso', tags: ['meta'] });
    const sub1 = add({ type: 'task', title: 'Diseñar sistema de tareas', content: 'Definir modelo unificado Item con type task/note/event', parent_id: root1, priority: 1, fecha_inicio: new Date(Date.now() + 86400000).toISOString().slice(0, 10), fecha_fin: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), estado: 'en_curso', tags: ['diseño'] });
    add({ type: 'task', title: 'Implementar treeview', content: 'Componente de árbol expandible con drag & drop', parent_id: sub1, priority: 1, fecha_inicio: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), estado: 'pendiente', tags: ['dev'] });
    add({ type: 'task', title: 'Crear store persistente', content: 'LocalStorage + CRUD completo', parent_id: sub1, priority: 2, estado: 'pendiente', tags: ['dev'] });
    add({ type: 'task', title: 'Estilos CSS modernos', content: 'Variables, layout responsivo, animaciones', parent_id: carpetaDiseno, priority: 3, estado: 'completada', tags: ['diseño'] });
    add({ type: 'task', title: 'Escribir tests', content: 'Cubrir casos de uso principales', parent_id: root1, priority: 2, estado: 'pendiente', tags: ['qa'] });

    add({ type: 'note', title: 'Ideas del modelo unificado', content: '# Modelo Unificado\n\nUn solo tipo `Item` con `type` para task/note/event.\n\n- **parent_id** define jerarquía y prerequisitos\n- **tags** para relaciones transversales\n- fechas solo para task/event', parent_id: null, tags: ['diseño', 'core'] });
    add({ type: 'note', title: 'Referencias de diseño UI', content: 'Inspiración: Things 3, Notion, Linear.\n\n- Clean, minimal\n- Prioridad con colores\n- Treeview con indentación clara', parent_id: carpetaDiseno, tags: ['diseño', 'ui'] });
    add({ type: 'note', title: 'Notas de la reunión', content: '## Sprint Planning\n\n- Definir modelo unificado\n- Implementar CRUD\n- Diseñar timeline\n\n### Pendientes\nRevisar drag & drop', parent_id: null, tags: ['reunión'] });

    add({ type: 'event', title: 'Review semanal', content: 'Revisar progreso del proyecto y ajustar prioridades', parent_id: null, priority: 1, fecha_inicio: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), tags: ['ritual'] });
    add({ type: 'event', title: 'Demo con el equipo', content: 'Mostrar avances del MVP', parent_id: null, priority: 2, fecha_inicio: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10), tags: ['ritual'] });

    const hoy = new Date();
    const mesStr = (d) => d.toISOString().slice(0, 10);
    add({ type: 'suscripcion', title: 'Netflix', content: 'Plan Premium 4K', monto: 199, periodicidad: 'mensual', fecha_inicio: mesStr(new Date(hoy.getFullYear(), hoy.getMonth(), 15)), tags: ['entretenimiento'], estado: 'activa' });
    const intDate = new Date();
    intDate.setDate(intDate.getDate() - 5);
    add({ type: 'suscripcion', title: 'Internet TotalPlay', content: '300mb fibra óptica', monto: 899, periodicidad: 'mensual', fecha_inicio: mesStr(intDate), tags: ['servicios'], estado: 'activa' });
    add({ type: 'suscripcion', title: 'Seguro auto', content: 'Seguro cobertura amplia', monto: 2400, periodicidad: 'bimestral', fecha_inicio: mesStr(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1)), tags: ['seguros'], estado: 'activa' });
    add({ type: 'gasto', title: 'Supermercado Soriana', content: 'Despensa quincenal', monto: 1250, fecha_inicio: mesStr(new Date(hoy.getFullYear(), hoy.getMonth(), 5)), tags: ['alimentacion'] });
    add({ type: 'gasto', title: 'Gasolina', content: 'Tanque lleno', monto: 850, fecha_inicio: mesStr(new Date(hoy.getFullYear(), hoy.getMonth(), 3)), tags: ['transporte'] });
    add({ type: 'ahorro', title: 'Fondo de emergencia', content: 'Meta $50,000 para imprevistos', monto: 50000, meta: 50000, acumulado: 8500, tags: ['meta'] });
    add({ type: 'ahorro', title: 'Viaje fin de año', content: 'Ahorro para vacaciones diciembre', monto: 15000, meta: 15000, acumulado: 3200, tags: ['personal'] });

    this.items.push(...batch);
    this._pendingCount += batch.length;
    this.save();
    this._dispatchStatus();
  }
}
