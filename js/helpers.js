export function formatDateInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayLocalStr() {
  return formatDateInput(new Date());
}

export function parseLocalDate(dateStr) {
  if (!dateStr) return new Date(NaN);
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function esc(s) {
  if (typeof s !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export function escAttr(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderMarkdown(text) {
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

export const ITEM_TYPES = {
  TASK: 'task',
  NOTE: 'note',
  EVENT: 'event',
  SUSCRIPCION: 'suscripcion',
  GASTO: 'gasto',
  AHORRO: 'ahorro',
  CARPETA: 'carpeta',
};

export const PRIORITY_LABELS = { 1: 'Alta', 2: 'Media', 3: 'Baja' };
export const TYPE_LABELS = {
  task: 'Tarea', note: 'Nota', event: 'Evento',
  suscripcion: 'Suscripción', gasto: 'Gasto', ahorro: 'Ahorro', carpeta: 'Carpeta',
};

const _icons = {
  task: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/><path d="M9 14l2 2 4-4"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  event: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  gasto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
  ahorro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
  suscripcion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
  carpeta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z"/></svg>',
};

export function getTypeIcon(type) {
  return _icons[type] || '';
}
