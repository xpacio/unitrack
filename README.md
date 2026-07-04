# UniTrack

![License](https://img.shields.io/badge/license-MIT-blue)
![Status](https://img.shields.io/badge/status-active-brightgreen)

Gestor unificado de tareas, notas y eventos. Offline-first, sincronización con PostgreSQL, editor Markdown, jerarquía por árbol y línea de tiempo.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | JavaScript ES6 Modules (sin framework) |
| Estilos | CSS3 (vanilla, sin preprocesador) |
| Persistencia | localStorage + PostgreSQL |
| Backend | PHP 8+ |
| Servidor | lighttpd con PHP-FPM |

## Arquitectura

Modelo unificado `Item` con `type` para task/note/event. Tres vistas (Tareas, Notas, Timeline) que operan sobre el mismo `Store`. Sin build step — corre directo en el navegador.

```
index.html           → shell HTML
css/base.css         → variables, reset, layout
css/nav.css          → navegación
css/tree.css         → árbol jerárquico
css/panel.css        → panel de detalle, editor, markdown
css/components.css   → modales, tags, search
css/views.css        → timeline, finanzas
css/auth.css         → landing / auth
css/mobile.css       → responsive móvil
js/store.js          → modelo, CRUD, persistencia, sync
js/app.js            → bootstrap, navegación, sync indicator
js/components/
  itemForm.js        → modal crear/editar
js/views/
  taskView.js        → treeview de tareas con drag & drop
  noteView.js        → treeview de notas con editor MD
  timelineView.js    → timeline con countdown
api/
  sync.php           → endpoint de sincronización
  config.php         → credenciales DB (gitignored)
```

## Funcionalidades

- **Tres vistas**: Tareas (jerarquía expandible), Notas (árbol + editor), Timeline (cards agrupadas por día)
- **Drag & drop**: Re-parenting de tareas arrastrando (con protección de ciclos)
- **Markdown**: Editor con vista previa (sin librerías externas) + cheatsheet modal
- **Tags**: Filtrado global clicando cualquier tag desde cualquier vista
- **Timeline**: Countdown dinámico (Atrasado/Hoy/Mañana/En N días/meses), actualización automática
- **Detail panel**: Deslizante desde la derecha con vista/edición inline
- **Búsqueda**: Tiempo real por título, contenido y tags
- **Prioridades**: 3 niveles con código de colores (rojo/naranja/verde)
- **Indicador de sync**: Spinner, contador de cambios pendientes, punto online/offline

## Sincronización

Offline-first: los datos se guardan siempre en localStorage y se sincronizan con PostgreSQL vía PHP.

- POST a `/api/sync.php` tras cada mutación + cada 30s
- Estrategia last-write-wins por timestamp `updated`
- Merge del lado cliente: prioriza datos del servidor, preserva items locales no subidos
- Fallo silencioso sin conexión; sincroniza automáticamente al recuperar conectividad

## API

| Método | Descripción |
|--------|------------|
| `GET` | Obtener todos los items |
| `POST` | Sincronizar (upsert + delete), devuelve estado completo |

## Base de datos

```sql
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'task',
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  parent_id TEXT REFERENCES items(id),
  tags TEXT[] DEFAULT '{}',
  priority INTEGER DEFAULT 2,
  fecha_inicio TEXT DEFAULT '',
  fecha_fin TEXT DEFAULT '',
  estado TEXT DEFAULT 'pendiente',
  created BIGINT NOT NULL,
  updated BIGINT NOT NULL
);
```

## Despliegue

1. Servir el directorio raíz con cualquier servidor web
2. Copiar `api/config.example.php` a `api/config.php` y ajustar credenciales PostgreSQL
3. Crear DB y tabla (SQL arriba)
4. Abrir en el navegador — los datos de ejemplo se cargan solos en el primer inicio

Sin backend configurado, la app funciona igual con localStorage únicamente.

## Licencia

MIT — Copyright 2026 xpacio
