const { ItemView, setIcon, Menu } = require('obsidian');
const { renderFileIcon } = require('./icons');
const { reorderSiblings } = require('./order-model');
const { listBuches } = require('./catalog');
const { flattenConcepts } = require('./buch-model');
const VIEW_TYPE = 'buches-navigator';

function iconButton(parent, icon, label, callback, extraClass = '') {
  const button = parent.createEl('button', { cls: `buches-icon-button ${extraClass}` });
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  setIcon(button, icon);
  button.addEventListener('click', event => { event.stopPropagation(); callback(); });
  return button;
}

class BuchesView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.expansion = new Map();
    this.renderTimer = null;
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Buches'; }
  getIcon() { return 'library'; }

  async onOpen() {
    this.contentEl.addClass('buches-view');
    const schedule = file => {
      if (!file || file.path === 'Buches' || file.path.startsWith('Buches/')) this.scheduleRender();
    };
    for (const event of ['create', 'delete', 'modify']) this.registerEvent(this.app.vault.on(event, schedule));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (oldPath === 'Buches' || oldPath.startsWith('Buches/')) this.scheduleRender();
      else schedule(file);
    }));
    this.registerEvent(this.app.metadataCache.on('changed', schedule));
    this.registerEvent(this.app.workspace.on('file-open', () => this.scheduleRender()));
    this.render();
  }
  async onClose() {
    if (this.renderTimer !== null) clearTimeout(this.renderTimer);
    this.renderTimer = null;
  }
  scheduleRender() {
    if (this.renderTimer !== null) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => { this.renderTimer = null; this.render(); }, 100);
  }
  render() {
    const container = this.contentEl;
    container.empty();
    const toolbar = container.createDiv({ cls: 'buches-toolbar' });
    toolbar.createEl('h4', { text: 'Buches' });
    iconButton(toolbar, 'plus', 'Create Buch', () => this.plugin.promptCreateBuch());
    const books = listBuches(this.app);
    if (!books.length) {
      container.createEl('p', { cls: 'buches-empty', text: 'No Buches yet. Create one with the + button.' });
      return;
    }
    const list = container.createDiv({ cls: 'buches-list' });
    for (const book of books) this.renderBook(list, book);
  }
  renderToggle(row, path, name, defaultExpanded = false) {
    const expanded = this.expansion.get(path) ?? defaultExpanded;
    const toggle = iconButton(row, expanded ? 'chevron-down' : 'chevron-right', `${expanded ? 'Collapse' : 'Expand'} ${name}`, () => {
      this.expansion.set(path, !expanded);
      this.render();
    }, 'buches-toggle');
    toggle.setAttribute('aria-expanded', String(expanded));
    return expanded;
  }
  renderTitle(row, file, name, icon, cls, ariaLabel) {
    const button = row.createEl('button', { cls });
    button.setAttribute('aria-label', ariaLabel);
    button.setAttribute('title', name);
    const view = this.app.workspace?.getMostRecentLeaf?.()?.view;
    if (!view?.sheet && this.app.workspace?.getActiveFile?.()?.path === file.path) button.setAttribute('aria-current', 'page');
    if (icon) {
      const iconEl = button.createEl('span', {cls:'buches-file-icon'});
      iconEl.setAttribute('aria-hidden','true');
      renderFileIcon(iconEl, icon, setIcon);
    }
    button.createEl('span', {cls:'buches-file-name', text:name});
    button.addEventListener('click', () => this.plugin.openFile(file));
    button.addEventListener('contextmenu', event => {
      event.preventDefault();
      const menu = new Menu();
      menu.addItem(item => item.setTitle('Set icon').setIcon('smile').onClick(() => this.plugin.promptIcon(file)));
      menu.showAtMouseEvent(event);
    });
    return button;
  }
  renderExerciseButton(row, file, name) {
    const button = iconButton(row, 'clipboard-list', `Exercises for ${name}`,
      () => this.plugin.openExercises(file), 'buches-exercises');
    const view = this.app.workspace?.getMostRecentLeaf?.()?.view;
    if (view?.sheet && view.file?.path === file.path) button.setAttribute('aria-current', 'page');
  }
  renderBook(parent, book) {
    const section = parent.createDiv({ cls: 'buches-book' });
    const row = section.createDiv({ cls: 'buches-tree-row buches-book-row' });
    const expanded = this.renderToggle(row, book.path, book.title, true);
    const bookmarkPath = this.plugin.lastRead?.get(book.path);
    const bookmark = bookmarkPath && flattenConcepts(book.concepts).find(item => item.file.path === bookmarkPath);
    const title = this.renderTitle(row, book.index, book.title, book.icon, 'buches-title', `Open ${book.title}`);
    if (!expanded && bookmark) this.markReadingPosition(row, title, bookmark);
    iconButton(row, 'plus', `New concept in ${book.title}`, () => {
      if (!expanded) {
        this.expansion.set(book.path, true);
        this.render();
      }
      this.plugin.promptCreateConcept(book.path);
    }, 'buches-add');
    this.renderExerciseButton(row, book.index, book.title);
    if (!expanded) return;
    const concepts = section.createDiv({ cls: 'buches-children' });
    if (!book.concepts.length) concepts.createDiv({ cls: 'buches-empty-concepts', text: 'No concepts yet' });
    for (const concept of book.concepts) this.renderConcept(concepts, concept, book, bookmark, true);
  }
  markReadingPosition(row, title, bookmark) {
    const label = `Última leitura: ${bookmark.name}`;
    row.addClass('buches-last-read');
    title.setAttribute('title', label);
    title.setAttribute('aria-description', label);
  }
  renderConcept(parent, concept, book, bookmark, topLevel = false) {
    const section = parent.createDiv({ cls: 'buches-node' });
    const row = section.createDiv({ cls: 'buches-tree-row buches-concept-row' });
    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', event => {
      event.stopPropagation();
      event.dataTransfer?.setData('text/plain', concept.file.path);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      row.addClass('is-dragging');
    });
    row.addEventListener('dragend', () => {
      row.removeClass('is-dragging');
      this.contentEl.querySelectorAll('.buches-tree-row').forEach(el => {
        el.removeClass('drag-over-before', 'drag-over-after');
      });
    });
    row.addEventListener('dragover', event => {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      const rect = row.getBoundingClientRect();
      const isBefore = event.clientY < rect.top + rect.height / 2;
      row.toggleClass('drag-over-before', isBefore);
      row.toggleClass('drag-over-after', !isBefore);
    });
    row.addEventListener('dragleave', () => {
      row.removeClass('drag-over-before', 'drag-over-after');
    });
    row.addEventListener('drop', async event => {
      event.preventDefault();
      event.stopPropagation();
      row.removeClass('drag-over-before', 'drag-over-after');
      const sourcePath = event.dataTransfer?.getData('text/plain');
      const targetPath = concept.file.path;
      if (!sourcePath || sourcePath === targetPath) return;
      const rect = row.getBoundingClientRect();
      const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      const reordered = await reorderSiblings(this.app, book, sourcePath, targetPath, position);
      if (reordered) {
        this.render();
        this.plugin.scheduleRefresh();
      }
    });
    const hasChildren = concept.children.length > 0;
    const expanded = hasChildren && this.renderToggle(row, concept.file.path, concept.name);
    if (!hasChildren) row.createEl('span', { cls: 'buches-toggle-spacer' });
    const icon = topLevel ? (concept.icon || 'book-open') : null;
    const title = this.renderTitle(row, concept.file, concept.name, icon, 'buches-title buches-concept', `Open concept ${concept.name}`);
    const path = concept.file.path;
    if (bookmark && (bookmark.file.path === path || (!expanded && bookmark.file.path.startsWith(`${path.slice(0, -3)}/`)))) {
      this.markReadingPosition(row, title, bookmark);
    }
    iconButton(row, 'plus', `New subconcept in ${concept.name}`, () => {
      this.expansion.set(concept.file.path, true);
      if (hasChildren && !expanded) this.render();
      this.plugin.promptCreateSubconcept(concept.file.path);
    }, 'buches-add');
    this.renderExerciseButton(row, concept.file, concept.name);
    if (!hasChildren || !expanded) return;
    const children = section.createDiv({ cls: 'buches-children' });
    for (const child of concept.children) this.renderConcept(children, child, book, bookmark);
  }
}
module.exports = { BuchesView, VIEW_TYPE };
