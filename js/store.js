export function createItem(data = {}) {
  return {
    id: crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    type: data.type || 'task',
    title: data.title || '',
    content: data.content || '',
    parent_id: data.parent_id || null,
    tags: data.tags || [],
    priority: data.priority ?? (data.type === 'note' ? null : 2),
    fecha_inicio: data.fecha_inicio || '',
    fecha_fin: data.fecha_fin || '',
    estado: data.estado || (data.type === 'note' ? null : 'pendiente'),
    created: Date.now(),
    updated: Date.now(),
  };
}

export class Store {
  constructor() {
    this.items = [];
    this._syncing = false;
    this._syncUrl = '/api/sync.php';
    this._pendingCount = 0;
    this._online = navigator.onLine;
    this.load();
    if (this.items.length === 0) this.seed();
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
        body: JSON.stringify({ items: payload }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.items) return;

      const seen = new Set();
      const merged = [];

      for (const item of data.items) {
        merged.push(item);
        seen.add(item.id);
      }

      for (const item of this.items) {
        if (!seen.has(item.id)) {
          merged.push(item);
        }
      }

      this._pendingCount = 0;
      this.items = merged;
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
      .filter(i => i.fecha_inicio && (i.type === 'task' || i.type === 'event'))
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

  getNextPrioritySibling(parentId) {
    const siblings = this.getChildren(parentId).filter(i => i.type === 'task');
    if (siblings.length === 0) return null;
    return siblings.reduce((a, b) => (a.priority ?? 2) < (b.priority ?? 2) ? a : b);
  }

  seed() {
    const id = (n) => n + '_' + Date.now();
    const sampleItems = [];
    const add = (data) => {
      const item = createItem(data);
      sampleItems.push(item);
      return item.id;
    };

    const root1 = add({ type: 'task', title: 'Lanzar MVP', content: 'Plan de lanzamiento de la versión inicial', parent_id: null, priority: 1, fecha_inicio: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), estado: 'en_curso', tags: ['meta'] });
    const sub1 = add({ type: 'task', title: 'Diseñar sistema de tareas', content: 'Definir modelo unificado Item con type task/note/event', parent_id: root1, priority: 1, fecha_inicio: new Date(Date.now() + 86400000).toISOString().slice(0, 10), fecha_fin: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), estado: 'en_curso', tags: ['diseño'] });
    add({ type: 'task', title: 'Implementar treeview', content: 'Componente de árbol expandible con drag & drop', parent_id: sub1, priority: 1, fecha_inicio: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), estado: 'pendiente', tags: ['dev'] });
    add({ type: 'task', title: 'Crear store persistente', content: 'LocalStorage + CRUD completo', parent_id: sub1, priority: 2, estado: 'pendiente', tags: ['dev'] });
    add({ type: 'task', title: 'Estilos CSS modernos', content: 'Variables, layout responsivo, animaciones', parent_id: root1, priority: 3, estado: 'completada', tags: ['diseño'] });
    add({ type: 'task', title: 'Escribir tests', content: 'Cubrir casos de uso principales', parent_id: root1, priority: 2, estado: 'pendiente', tags: ['qa'] });

    add({ type: 'note', title: 'Ideas del modelo unificado', content: '# Modelo Unificado\n\nUn solo tipo `Item` con `type` para task/note/event.\n\n- **parent_id** define jerarquía y prerequisitos\n- **tags** para relaciones transversales\n- fechas solo para task/event', parent_id: null, tags: ['diseño', 'core'] });
    add({ type: 'note', title: 'Referencias de diseño UI', content: 'Inspiración: Things 3, Notion, Linear.\n\n- Clean, minimal\n- Prioridad con colores\n- Treeview con indentación clara', parent_id: null, tags: ['diseño', 'ui'] });
    add({ type: 'note', title: 'Notas de la reunión', content: '## Sprint Planning\n\n- Definir modelo unificado\n- Implementar CRUD\n- Diseñar timeline\n\n### Pendientes\nRevisar drag & drop', parent_id: null, tags: ['reunión'] });

    add({ type: 'event', title: 'Review semanal', content: 'Revisar progreso del proyecto y ajustar prioridades', parent_id: null, priority: 1, fecha_inicio: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), tags: ['ritual'] });
    add({ type: 'event', title: 'Demo con el equipo', content: 'Mostrar avances del MVP', parent_id: null, priority: 2, fecha_inicio: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10), tags: ['ritual'] });

    for (const item of sampleItems) {
      this.add(item);
    }
  }
}
