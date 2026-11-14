const test = require('node:test');
const assert = require('node:assert/strict');
const obsidian = require('obsidian');

class MockComponent {
  constructor() { this.children = []; }
  addChild(child) { this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter(item => item !== child); }
  register() {}
  registerEvent() {}
}

class MockElement {
  constructor(tag = 'div', ownerDocument, parent = null) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parent = parent;
    this.dataset = {};
    this.children = [];
    this.classes = new Set();
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = '';
    this.isConnected = true;
    this.hidden = false;
  }
  addClass(...names) { for (const name of names) this.classes.add(name); }
  setText(text) { this.textContent = text; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...nodes) {
    for (const node of nodes) {
      if (node && typeof node === 'object') node.parent = this;
      this.children.push(node);
    }
  }
  empty() { this.children = []; this.textContent = ''; }
  remove() {}
  contains(node) {
    for (let current = node; current; current = current.parent) {
      if (current === this) return true;
    }
    return false;
  }
  closest(selector) {
    const cls = selector.startsWith('.') ? selector.slice(1) : null;
    for (let current = this; current; current = current.parent) {
      if (cls ? current.classes?.has(cls) : current.tagName === selector.toUpperCase()) return current;
    }
    return null;
  }
  createDiv(opts = {}) { return this.createEl('div', opts); }
  createSpan(opts = {}) { return this.createEl('span', opts); }
  createEl(tag, opts = {}) {
    const child = new MockElement(tag, this.ownerDocument, this);
    if (opts.cls) for (const cls of opts.cls.split(/\s+/).filter(Boolean)) child.addClass(cls);
    if (opts.text !== undefined) child.setText(opts.text);
    if (opts.attr) for (const [k, v] of Object.entries(opts.attr)) child.setAttribute(k, v);
    this.children.push(child);
    return child;
  }
  addEventListener(type, fn) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  dispatchEvent(type) {
    for (const fn of this.listeners.get(type) ?? []) fn({ type, target: this });
  }
  querySelector(selector) {
    const attrMatch = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
    for (const child of this.children) {
      if (child instanceof MockElement) {
        if (attrMatch && child.getAttribute(attrMatch[1]) === attrMatch[2]) return child;
        const found = child.querySelector(selector);
        if (found) return found;
      }
    }
    return null;
  }
}

const obsidianSnapshot = { ...obsidian };
obsidian.Component = MockComponent;
obsidian.Keymap = { isModEvent: () => false };
obsidian.parseYaml = text => {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+):[ \t]*(.+?)[ \t]*$/);
    if (match) result[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return result;
};
obsidian.MarkdownRenderer = {
  render: async (_app, markdown, target) => {
    for (const match of markdown.matchAll(/data-buches-formula="([^"]+)"/g)) {
      target.createSpan({ attr: { 'data-buches-formula': match[1] } });
    }
  },
};
obsidian.loadMathJax = async () => {};
obsidian.renderMath = source => ({ source, kind: 'mathjax' });
obsidian.finishRenderMath = () => {};

test.after(() => {
  for (const key of Object.keys(obsidian)) {
    if (!Object.hasOwn(obsidianSnapshot, key)) delete obsidian[key];
  }
  Object.assign(obsidian, obsidianSnapshot);
});

const { renderMarkdown, SolutionMathRouter } = require('../src/math');
const { BuchReader } = require('../src/reader');

test('renderMarkdown passes normalized directory paths to Typst Mate', async () => {
  const calls = [];
  const doc = { createElement: tag => new MockElement(tag, doc) };
  const target = new MockElement('div', doc);
  const app = {
    plugins: {
      plugins: {
        'typst-mate': {
          typstManager: {
            ready: true,
            render: (source, el, mode, directory, path) => {
              calls.push({ source, mode, directory, path });
              return el;
            },
          },
        },
      },
    },
  };

  await renderMarkdown(app, 'Proof: $A^(-1)$', target, 'Buches/LA/_solutions/s1.md', new MockComponent(), 'typst');
  await renderMarkdown(app, 'Root: $x^2$', new MockElement('div', doc), 'root.md', new MockComponent(), 'typst');

  assert.deepEqual(calls, [
    { source: 'A^(-1)', mode: 'inline', directory: '/Buches/LA/_solutions/', path: 'Buches/LA/_solutions/s1.md' },
    { source: 'x^2', mode: 'inline', directory: '/', path: 'root.md' },
  ]);
});

test('BuchReader.mountSolution renders user Typst previews directly instead of delegating to native embeds', async () => {
  const chapter = { path: 'Buches/LA/concepts/Cramer.md' };
  const typstNote = { path: 'Buches/LA/_solutions/user.md' };
  const plainNote = { path: 'Buches/LA/_solutions/plain-user.md' };
  const aiNote = { path: 'Buches/LA/_solutions/ai.md' };
  const legacyLatexNote = { path: 'Buches/LA/_solutions/graded-latex.md' };
  const files = new Map([
    [typstNote.path, '---\nrenderer: typst\n---\n\n$A^(-1)$'],
    [plainNote.path, '$mat(1, 2)$'],
    [aiNote.path, '---\nrenderer: latex\n---\n\n$A^{-1}$'],
    [legacyLatexNote.path, '---\nbuches_grade:\n  score: 10\nrenderer: latex\n---\n\n$\\det(A)$'],
  ]);

  let embedLoads = 0;
  let embedShows = 0;
  const modifyListeners = [];
  const app = {
    vault: {
      getAbstractFileByPath: path => (files.has(path) ? { path } : null),
      read: async file => files.get(file.path),
      on: (event, fn) => {
        if (event === 'modify') modifyListeners.push(fn);
        return {};
      },
    },
    workspace: {
      on: () => ({}),
      getLeaf: () => ({ openFile: async () => {} }),
    },
    metadataCache: { getFirstLinkpathDest: () => null },
    embedRegistry: {
      getEmbedCreator: () => () => ({
        loadFile: async () => { embedLoads++; },
        showEditor: () => { embedShows++; },
      }),
    },
  };

  const renderCalls = [];
  const doc = { createElement: tag => new MockElement(tag, doc) };
  const reader = new BuchReader({ app }, {
    aiSolutions: { errors: new Map(), isPending: () => false },
    report(error) { throw error; },
  });
  reader.render = async (markdown, _host, state, engine) => {
    renderCalls.push({ path: state.file.path, markdown, engine });
  };

  const state = {
    file: chapter,
    model: { book: { path: 'Buches/LA', index: {} } },
    component: new MockComponent(),
    readerMath: 'mathjax',
    solutionMath: 'typst',
  };
  const unit = { exercise: { id: '^ex' }, hints: [], markdown: '' };

  const mountTab = (tab, nativeEdit = false) => {
    const details = new MockElement('details', doc);
    const panel = details.createDiv();
    const tools = details.createDiv();
    const mounted = reader.mountSolution(panel, tools, tab, unit, state);
    return { mounted, tools };
  };

  const userMount = mountTab({ path: typstNote.path, kind: 'manual' });
  await userMount.mounted.load();
  const plainMount = mountTab({ path: plainNote.path, kind: 'manual' });
  await plainMount.mounted.load();
  const aiMount = mountTab({ path: aiNote.path, kind: 'ai' });
  await aiMount.mounted.load();
  const gradedMount = mountTab({ path: legacyLatexNote.path, kind: 'manual' });
  await gradedMount.mounted.load();

  assert.equal(embedLoads, 0);
  assert.deepEqual(renderCalls, [
    { path: typstNote.path, markdown: '$A^(-1)$', engine: 'typst' },
    { path: plainNote.path, markdown: '$mat(1, 2)$', engine: 'typst' },
    { path: aiNote.path, markdown: '$A^{-1}$', engine: 'mathjax' },
    { path: legacyLatexNote.path, markdown: '$\\det(A)$', engine: 'mathjax' },
  ]);

  files.set(typstNote.path, '---\nrenderer: typst\n---\n\n$adj(A)$');
  for (const fn of modifyListeners) await fn(userMount.mounted.note);
  assert.deepEqual(renderCalls.at(-1), { path: typstNote.path, markdown: '$adj(A)$', engine: 'typst' });

  const editButton = userMount.tools.children[0];
  await editButton.listeners.get('click')[0]();
  assert.equal(embedLoads, 1);
  assert.equal(embedShows, 1);

  app.embedRegistry = null;
  const fallbackMount = mountTab({ path: typstNote.path, kind: 'manual' });
  await fallbackMount.tools.children[0].listeners.get('click')[0]();
  assert.deepEqual(renderCalls.at(-1), {
    path: chapter.path,
    markdown: `![[${typstNote.path}]]`,
    engine: 'typst',
  });
});

test('SolutionMathRouter isolates inline Live Preview math per solution embed without hijacking other panes', async () => {
  const typstCalls = [];
  const mjxCalls = [];
  const delegateCalls = [];
  const doc = { activeElement: null, createElement: tag => new MockElement(tag, doc) };
  const delegate = (source, opts) => {
    delegateCalls.push({ source, display: Boolean(opts?.display) });
    return { kind: 'delegate', source };
  };
  const win = { document: doc, MathJax: { tex2chtml: delegate } };

  const files = new Map([
    ['Buches/LA/_solutions/user.md', '---\nrenderer: typst\n---\n\n$u in U$'],
    ['Buches/LA/_solutions/ai.md', '---\nrenderer: latex\n---\n\n$\\det(A)$'],
  ]);
  const modifyListeners = [];
  const app = {
    plugins: {
      plugins: {
        'typst-mate': {
          originalTex2chtml: (source, opts) => {
            mjxCalls.push({ source, display: Boolean(opts?.display) });
            return { kind: 'native-mjx', source };
          },
          typstManager: {
            ready: true,
            render: (source, el, mode, directory, path) => {
              typstCalls.push({ source, mode, directory, path, tag: el.tagName });
              el.rendered = source;
              return el;
            },
          },
        },
      },
    },
    vault: {
      getAbstractFileByPath: path => (files.has(path) ? { path } : null),
      read: async file => files.get(file.path),
      cachedRead: async file => files.get(file.path),
      on: (event, fn) => {
        if (event === 'modify') modifyListeners.push(fn);
        return {};
      },
    },
    workspace: { on: () => ({}), getLeaf: () => ({ openFile: async () => {} }) },
    metadataCache: { getFirstLinkpathDest: () => null },
    embedRegistry: {
      getEmbedCreator: () => ({ containerEl }, note) => ({
        loadFile: async () => { win.MathJax.tex2chtml('load', { display: false }); },
        showEditor() {
          this.editor = { getValue: () => files.get(note.path) };
          this.cmInput = containerEl.createEl('div', { cls: 'cm-editor' });
          doc.activeElement = this.cmInput;
          win.MathJax.tex2chtml(note.path.endsWith('ai.md') ? '\\det(A)' : 'u in U', { display: false });
        },
        showPreview() { this.editor = null; },
      }),
    },
  };

  const router = new SolutionMathRouter(app, () => win);
  const reader = new BuchReader({ app }, {
    mathRouter: router,
    settings: { solutionMath: 'typst' },
    aiSolutions: { errors: new Map(), isPending: () => false },
    report(error) { throw error; },
  });
  reader.render = async () => {};

  const readerLeaf = new MockElement('div', doc);
  readerLeaf.addClass('workspace-leaf-content');
  readerLeaf.dataset.type = 'buches-reader';
  const unit = { exercise: { id: '^ex' }, hints: [], markdown: '' };
  const state = {
    file: { path: 'Buches/LA/concepts/Proj.md' },
    model: { book: { path: 'Buches/LA', index: {} } },
    component: new MockComponent(),
    readerMath: 'mathjax',
    solutionMath: 'typst',
  };

  const userTools = readerLeaf.createDiv();
  const userPanel = readerLeaf.createEl('details').createDiv();
  reader.mountSolution(userPanel, userTools, { path: 'Buches/LA/_solutions/user.md', kind: 'manual' }, unit, state);
  doc.activeElement = userTools.children[0];
  await userTools.children[0].listeners.get('click')[0]();
  const userHost = userPanel.children[1].children[0];

  const aiTools = readerLeaf.createDiv();
  const aiPanel = readerLeaf.createEl('details').createDiv();
  reader.mountSolution(aiPanel, aiTools, { path: 'Buches/LA/_solutions/ai.md', kind: 'ai' }, unit, state);
  doc.activeElement = aiTools.children[0];
  await aiTools.children[0].listeners.get('click')[0]();
  const aiHost = aiPanel.children[1].children[0];

  assert.equal(typstCalls[0].source, 'load');
  assert.equal(typstCalls[1].source, 'u in U');
  assert.equal(typstCalls[1].path, 'Buches/LA/_solutions/user.md');
  assert.equal(mjxCalls[0].source, 'load');
  assert.equal(mjxCalls[1].source, '\\det(A)');

  // Focusing back to the user solution routes subsequent Live Preview edits to Typst again.
  doc.activeElement = userHost.children[0];
  userHost.dispatchEvent('focusin');
  win.MathJax.tex2chtml('w in U^bot', { display: false });
  assert.equal(typstCalls.at(-1).source, 'w in U^bot');

  // External Markdown tabs stay untouched when focused.
  const otherLeaf = new MockElement('div', doc);
  otherLeaf.addClass('workspace-leaf-content');
  otherLeaf.dataset.type = 'markdown';
  doc.activeElement = otherLeaf.createDiv({ cls: 'cm-editor' });
  const extResult = win.MathJax.tex2chtml('x^2', { display: false });
  assert.equal(extResult.kind, 'delegate');
  assert.deepEqual(delegateCalls, [{ source: 'x^2', display: false }]);

  // Updating note metadata updates the active embed engine cleanly.
  files.set('Buches/LA/_solutions/user.md', '---\nrenderer: latex\n---\n\n\\det(A)');
  for (const fn of modifyListeners) await fn({ path: 'Buches/LA/_solutions/user.md' });
  doc.activeElement = userHost.children[0];
  win.MathJax.tex2chtml('\\det(A)', { display: false });
  assert.equal(mjxCalls.at(-1).source, '\\det(A)');

  router.unload();
  assert.equal(win.MathJax.tex2chtml, delegate);
});
