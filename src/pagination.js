const { findBuchContext } = require('./buch-model');
const { getPagination } = require('./order-model');
const { iconFor, renderFileIcon } = require('./icons');
const { setIcon } = require('obsidian');

function renderPagination(parent, pagination, openFile) {
  const el = parent.createEl('nav', { cls: 'buches-pagination', attr: { 'aria-label': 'Chapter navigation' } });
  for (const [direction, page, arrow] of [
    ['prev', pagination?.previous, '←'],
    ['next', pagination?.next, '→'],
  ]) {
    if (!page) continue;
    const button = el.createEl('button', { cls: `buches-page-button buches-page-${direction}` });
    button.setAttribute('aria-label', `${direction === 'prev' ? 'Previous' : 'Next'} note: ${page.name}`);
    if (direction === 'prev') button.createSpan({ cls: 'buches-page-arrow', text: arrow, attr: { 'aria-hidden': 'true' } });
    button.createSpan({ cls: 'buches-page-nav-title', text: page.name });
    if (direction === 'next') button.createSpan({ cls: 'buches-page-arrow', text: arrow, attr: { 'aria-hidden': 'true' } });
    button.addEventListener('click', () => openFile(page.file, direction));
  }
  return el;
}

class PaginationRenderer {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.rendered = new Map();
    this.noteIcons = new Map();
    this.revision = 0;
  }
  async refresh() {
    const token = ++this.revision;
    const leaves = [];
    this.app.workspace.iterateAllLeaves(leaf => {
      if (leaf.view?.getViewType?.() === 'markdown') leaves.push(leaf);
    });
    const activeViews = new Set(leaves.map(leaf => leaf.view));
    for (const [view, el] of this.rendered) {
      if (!activeViews.has(view)) { el.remove(); this.rendered.delete(view); }
    }
    for (const [view, el] of this.noteIcons) {
      if (!activeViews.has(view)) { el.remove(); this.noteIcons.delete(view); }
    }
    for (const leaf of leaves) {
      const view = leaf.view;
      if (!view.file || !view.contentEl) continue;
      const context = findBuchContext(this.app, view.file);
      const prevEl = this.rendered.get(view);
      const prevIcon = this.noteIcons.get(view);

      if (!context) {
        view.containerEl?.removeClass?.('buches-is-index');
        view.containerEl?.removeClass?.('buches-is-concept');
        if (prevEl) { prevEl.remove(); this.rendered.delete(view); }
        if (prevIcon) { prevIcon.remove(); this.noteIcons.delete(view); }
        continue;
      }

      if (context.isIndex) {
        view.containerEl?.addClass?.('buches-is-index');
        view.containerEl?.removeClass?.('buches-is-concept');
        if (prevIcon) { prevIcon.remove(); this.noteIcons.delete(view); }
      } else {
        view.containerEl?.removeClass?.('buches-is-index');
        view.containerEl?.addClass?.('buches-is-concept');
        const icon = iconFor(this.app, view.file);
        const inlineTitle = view.contentEl.querySelector('.inline-title');
        if (icon && inlineTitle && inlineTitle.parentElement) {
          if (prevIcon) prevIcon.remove();
          const iconEl = view.contentEl.ownerDocument.createElement('div');
          iconEl.className = 'buches-note-icon';
          iconEl.setAttribute('aria-hidden', 'true');
          renderFileIcon(iconEl, icon, setIcon);
          inlineTitle.parentElement.insertBefore(iconEl, inlineTitle);
          this.noteIcons.set(view, iconEl);
        } else if (prevIcon) {
          prevIcon.remove();
          this.noteIcons.delete(view);
        }
      }

      const pagination = getPagination(this.app, context.book, view.file.path);
      if (token !== this.revision) return;
      if (prevEl) prevEl.remove();
      const el = view.contentEl.createDiv({ cls: 'buches-editor-navigation' });
      const read = el.createEl('button', { cls: 'buches-reader-action', text: 'Read book' });
      read.addEventListener('click', () => this.plugin.openFile(context.file, leaf));
      renderPagination(el, withFinish(pagination, context), (file, direction) =>
        this.plugin.turnPage ? this.plugin.turnPage(context, leaf, file, direction) : this.plugin.openFile(file, leaf));
      this.rendered.set(view, el);
    }
  }
  unload() {
    this.revision++;
    for (const el of this.rendered.values()) el.remove();
    this.rendered.clear();
    for (const el of this.noteIcons.values()) el.remove();
    this.noteIcons.clear();
    this.app.workspace.iterateAllLeaves(leaf => {
      leaf.view?.containerEl?.removeClass?.('buches-is-index');
      leaf.view?.containerEl?.removeClass?.('buches-is-concept');
    });
  }
}

function withFinish(pagination, context) {
  if (!pagination || pagination.next || !context?.concept) return pagination;
  return { ...pagination, next: { file: context.book.index, name: 'Finish book' } };
}

module.exports = { PaginationRenderer, renderPagination, withFinish };
