export class TreeRenderer {
  constructor(store) {
    this.store = store;
    this._expanded = new Set();
  }

  render(parentId = null, depth = 0, renderRow, sortFn) {
    const children = this.store.getChildren(parentId);
    if (!children.length) return '';

    const sorter = sortFn || ((a, b) => {
      if (a.type === 'carpeta' && b.type !== 'carpeta') return -1;
      if (a.type !== 'carpeta' && b.type === 'carpeta') return 1;
      return 0;
    });
    children.sort(sorter);

    let html = '';
    for (const item of children) {
      const isExpanded = this._expanded.has(item.id);
      const hasChildren = this.store.getChildren(item.id).length > 0;
      html += `
        <div class="tree-node" data-id="${item.id}">
          ${renderRow(item, depth, isExpanded, hasChildren)}
          <div class="tree-children" style="display: ${isExpanded ? 'block' : 'none'}">
            ${this.render(item.id, depth + 1, renderRow, sortFn)}
          </div>
        </div>`;
    }
    return html;
  }

  setupToggle(treeEl) {
    treeEl.addEventListener('click', (e) => {
      const toggle = e.target.closest('.tree-toggle:not(.leaf)');
      if (!toggle) return;
      const node = toggle.closest('.tree-node');
      const childrenDiv = node.querySelector('.tree-children');
      if (!childrenDiv) return;
      const isHidden = childrenDiv.style.display === 'none';
      childrenDiv.style.display = isHidden ? 'block' : 'none';
      toggle.classList.toggle('expanded', isHidden);
      if (isHidden) this._expanded.add(node.dataset.id);
      else this._expanded.delete(node.dataset.id);
    });
  }

  expanded(id) {
    return this._expanded.has(id);
  }
}
