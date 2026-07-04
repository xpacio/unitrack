# UniTrack — Plan de mejoras

## Arquitectura DB (Option B)

### Schema final

**items** (columnas financieras eliminadas):
```
id, type, title, content, parent_id, tags, priority,
fecha_inicio, fecha_fin, estado, created, updated, user_id
```

**items_finanza** (nueva):
```
id TEXT PK → items(id) ON DELETE CASCADE
monto NUMERIC NOT NULL DEFAULT 0
periodicidad TEXT DEFAULT NULL        -- 'mensual', 'bimestral'
meta NUMERIC NOT NULL DEFAULT 0
acumulado NUMERIC NOT NULL DEFAULT 0
cantidad INTEGER NOT NULL DEFAULT 1
precio_unitario NUMERIC NOT NULL DEFAULT 0
```

### Modelo de gastos (jerárquico)

| Tipo | parent_id | cantidad | precio_unitario | monto |
|------|-----------|----------|-----------------|-------|
| Gasto simple | NULL | 1 | = monto | directo |
| Compra (padre) | NULL | 1 | 0 | guardado + verificado vs suma hijos |
| Línea de compra | purchase_id | N | precio por unidad | N × pu |

- Hijos visibles en lista plana y anidados bajo el padre
- Pay en compra → cascada con confirm a hijos
- Verificación: badge si suma hijos != monto padre

### Fases

| Fase | Archivos | Cambio |
|------|----------|--------|
| F1 | `migration.sql`, script PHP | Crear `items_finanza`, migrar datos existentes, convertir `productos` inline a items hijo |
| F2 | `sync.php` | GET con `LEFT JOIN items_finanza`, POST escribe ambas tablas |
| F3 | `store.js`, `syncEngine.js` | `createItem()` init finanza fields, sync plano, `getTotalesMes()` actualizado |
| F4 | `itemForm.js` | Eliminar inline `productos`. Agregar campos cantidad/precio_unitario. Manejar hijos. |
| F5 | `finanzaView.js`, CSS files | Tree de gastos, detalle/edición compras, pay con cascada |
| F6 | SQL migration | `ALTER TABLE items DROP COLUMN` monto, periodicidad, meta, acumulado, productos |

---

## Tree view: toggle/cuerpo separados + checkbox funcional + subtareas expandibles

### Problemas
1. Toggle (`▶`) muy pequeño (20×20), sin hover, incrustado en fila → difícil de acertar
2. Click en cualquier parte del `.tree-row` abre detalle, compite con toggle
3. Checkbox `.tree-checkbox` es decorativo — no togglea estado
4. Tareas con subtareas no tienen toggle ni wrapper colapsable — subtareas invisibles en árbol

### Solución

**Estructura unificada (todos los tipos con hijos):**
```
.tree-node
├── .tree-row (sin cursor propio)
│   ├── .tree-toggle (32×32, hover bg) → expandir/colapsar
│   └── .tree-row-body (cursor:pointer) → abre detalle
│       ├── .tree-checkbox (solo tasks)
│       ├── .tree-title / badges
│       └── ...
└── .tree-children (display: none/block, solo si tiene hijos)
```

### Cambios por archivo

| Archivo | Cambio |
|---------|--------|
| `taskView.js:28-86` | `renderTree()` — `.tree-toggle`, `.tree-children` wrapper, `_expandedTasks` Set |
| `taskView.js:88-117` | `attachEvents()` — handlers: toggle, checkbox, row-body |
| `taskView.js:203-278` | `attachPanelEvents()` — checkbox handler en detalle (hermanas/subtareas) |
| `noteView.js:68-82` | `renderTree()` — `.tree-row-body` wrapper |
| `noteView.js:88-131` | `attachEvents()` — target `.tree-row` → `.tree-row-body` |
| `css/tree.css` | `.tree-toggle` 32×32 + hover, `.tree-row-body` nuevo, `.tree-row` sin cursor |
