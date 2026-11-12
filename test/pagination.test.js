const test = require('node:test');
const assert = require('node:assert/strict');
const { PaginationRenderer } = require('../src/pagination');

class Element {
  constructor(tag = 'div', doc = null) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc ?? { createElement: t => new Element(t, this.ownerDocument) };
    this.children = [];
    this.classList = new Set();
    this.attrs = {};
    this.listeners = {};
    this.parentElement = null;
    this.textContent = '';
  }
  get className() { return Array.from(this.classList).join(' '); }
  set className(val) { this.classList = new Set((val || '').split(/\s+/).filter(Boolean)); }
  addClass(c) { this.classList.add(c); }
  removeClass(c) { this.classList.delete(c); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  createEl(tag, opts = {}) {
    const el = new Element(tag, this.ownerDocument);
    if (opts.cls) el.className = opts.cls;
    if (opts.text) el.textContent = opts.text;
    this.appendChild(el);
    return el;
  }
  createSpan(opts) { return this.createEl('span', opts); }
  createDiv(opts) { return this.createEl('div', opts); }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  insertBefore(newChild, refChild) {
    newChild.parentElement = this;
    const idx = this.children.indexOf(refChild);
    if (idx < 0) this.children.push(newChild);
    else this.children.splice(idx, 0, newChild);
    return newChild;
  }
  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx >= 0) this.parentElement.children.splice(idx, 1);
      this.parentElement = null;
    }
  }
  querySelector(selector) {
    if (selector === '.inline-title') return this.children.find(c => c.classList.has('inline-title')) ?? null;
    return null;
  }
  addEventListener(type, fn) { this.listeners[type] = fn; }
}

function setup() {
  const indexFile = { path: 'Buches/Book/_index.md', name: '_index.md', extension: 'md' };
  const concept1 = { path: 'Buches/Book/concepts/Alpha.md', name: 'Alpha.md', extension: 'md' };
  const concept2 = { path: 'Buches/Book/concepts/Beta.md', name: 'Beta.md', extension: 'md' };
  const otherFile = { path: 'Notes/Random.md', name: 'Random.md', extension: 'md' };

  const folder = (path, children) => ({ path, name: path.split('/').pop(), children });
  const root = folder('Buches', [
    folder('Buches/Book', [
      indexFile,
      folder('Buches/Book/concepts', [concept1, concept2]),
    ]),
  ]);

  const doc = { createElement: t => new Element(t) };
  const containerEl = new Element('div', doc);
  const contentEl = new Element('div', doc);
  containerEl.appendChild(contentEl);
  const inlineTitle = contentEl.createDiv({ cls: 'inline-title', text: 'Alpha' });

  const view = { file: indexFile, containerEl, contentEl, getViewType: () => 'markdown' };
  const leaf = { view };

  const metadata = {
    [indexFile.path]: { frontmatter: { title: 'Book Title', type: 'buch' } },
    [concept1.path]: { frontmatter: { name: 'Alpha', icon: 'compass', order: 0 } },
    [concept2.path]: { frontmatter: { name: 'Beta', order: 1 } },
  };

  const app = {
    vault: { getAbstractFileByPath: p => p === 'Buches' ? root : null },
    metadataCache: { getFileCache: f => metadata[f?.path] ?? null },
    workspace: { iterateAllLeaves: cb => cb(leaf) },
  };

  const actions = [];
  const plugin = { openFile: f => actions.push(f.path) };

  return { app, plugin, view, leaf, indexFile, concept1, concept2, otherFile, actions };
}

test('pagination renderer sets view classes and renders wiki pagination for index and concepts', async () => {
  const { app, plugin, view, indexFile, concept1, concept2, actions } = setup();
  const renderer = new PaginationRenderer(app, plugin);

  // Index note
  view.file = indexFile;
  await renderer.refresh();
  assert.ok(view.containerEl.classList.has('buches-is-index'));
  assert.ok(!view.containerEl.classList.has('buches-is-concept'));

  let pagination = view.contentEl.children.find(c => c.classList.has('buches-editor-navigation')).children.find(c => c.classList.has('buches-pagination'));
  assert.ok(pagination);
  const nextBtn = pagination.children.find(c => c.classList.has('buches-page-next'));
  assert.ok(nextBtn);
  assert.equal(nextBtn.getAttribute('aria-label'), 'Next note: Alpha');
  nextBtn.listeners.click();
  assert.deepEqual(actions.pop(), concept1.path);

  // Concept note with icon
  view.file = concept1;
  await renderer.refresh();
  assert.ok(!view.containerEl.classList.has('buches-is-index'));
  assert.ok(view.containerEl.classList.has('buches-is-concept'));
  const noteIcon = view.contentEl.children.find(c => c.classList.has('buches-note-icon'));
  assert.ok(noteIcon);

  pagination = view.contentEl.children.find(c => c.classList.has('buches-editor-navigation')).children.find(c => c.classList.has('buches-pagination'));
  assert.ok(pagination);
  const prevBtn = pagination.children.find(c => c.classList.has('buches-page-prev'));
  assert.equal(prevBtn.getAttribute('aria-label'), 'Previous note: Book Title');
  prevBtn.listeners.click();
  assert.deepEqual(actions.pop(), indexFile.path);

  renderer.unload();
  assert.ok(!view.contentEl.children.some(c => c.classList.has('buches-editor-navigation')));
  assert.ok(!view.containerEl.classList.has('buches-is-concept'));
});
