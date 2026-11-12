const test = require('node:test');
const assert = require('node:assert/strict');
const { BuchesView, VIEW_TYPE } = require('../src/view');

class Element {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.className = ''; this.attrs = {}; this.listeners = {}; this.textContent = ''; }
  empty() { this.children = []; this.textContent = ''; }
  addClass(name) { this.className += ' ' + name; }
  createEl(tag, options = {}) { const child = new Element(tag); child.className = options.cls ?? ''; child.textContent = options.text ?? ''; this.children.push(child); return child; }
  createDiv(options) { return this.createEl('div', options); }
  setAttribute(name, value) { this.attrs[name] = value; }
  addEventListener(event, fn) { this.listeners[event] = fn; }
  setText(text) { this.textContent = text; }
}
function file(path) { return { path, name: path.split('/').pop(), extension: 'md' }; }
function folder(path, children) { return { path, name: path.split('/').pop(), children }; }
function setup() {
  const index = file('Buches/F/_index.md');
  const concept = file('Buches/F/concepts/thing.md');
  const root = folder('Buches', [folder('Buches/F', [index, folder('Buches/F/concepts', [concept])])]);
  const events = [];
  const app = { workspace: { on: () => ({}) }, vault: { getAbstractFileByPath: () => root, on: () => ({}) }, metadataCache: { getFileCache: f => ({frontmatter: f === index ? {title: 'A title'} : {name: 'A concept'}}), on: () => ({}) } };
  const plugin = { app, promptCreateConcept: (...args) => events.push(['concept', ...args]), promptCreateBuch: () => events.push(['buch']), openFile: f => events.push(['open', f.path]) };
  return { plugin, events, app };
}
function flatten(root) { return [root, ...root.children.flatMap(flatten)]; }

test('concept branches start collapsed and only top-level concepts display icons', async () => {
  const {plugin, events, app} = setup();
  const index = file('Buches/F/_index.md');
  const parent = file('Buches/F/concepts/parent.md');
  const child = file('Buches/F/concepts/parent/child.md');
  const grandchild = file('Buches/F/concepts/parent/child/grandchild.md');
  const root = folder('Buches', [folder('Buches/F', [index, folder('Buches/F/concepts', [parent, folder('Buches/F/concepts/parent', [child, folder('Buches/F/concepts/parent/child', [grandchild])])])])]);
  app.vault.getAbstractFileByPath = () => root;
  app.metadataCache.getFileCache = () => ({ frontmatter: { icon: 'box' } });
  plugin.lastRead = new Map([['Buches/F', grandchild.path]]);
  plugin.promptCreateSubconcept = path => events.push(['subconcept', path]);
  const view = new BuchesView({app}, plugin);
  view.contentEl = new Element(); view.registerEvent = () => {};
  await view.onOpen();
  let nodes = flatten(view.contentEl);
  const bookmark = () => nodes.find(n => n.className.includes('buches-last-read'))?.children.find(n => n.attrs['aria-description']);
  assert.ok(nodes.some(n => n.textContent === 'parent'));
  assert.ok(!nodes.some(n => n.textContent === 'child'));
  assert.equal(bookmark().attrs['aria-label'], 'Open concept parent');
  assert.equal(bookmark().attrs.title, 'Última leitura: grandchild');
  assert.ok(nodes.find(n => n.attrs['aria-label'] === 'Open concept parent').children.some(n => n.className === 'buches-file-icon'));
  nodes.find(n => n.attrs['aria-label'] === 'Expand parent').listeners.click({stopPropagation(){}});
  nodes = flatten(view.contentEl);
  assert.equal(bookmark().attrs['aria-label'], 'Open concept child');
  assert.ok(!nodes.find(n => n.attrs['aria-label'] === 'Open concept child').children.some(n => n.className === 'buches-file-icon'));
  assert.ok(!nodes.some(n => n.textContent === 'grandchild'));
  nodes.find(n => n.attrs['aria-label'] === 'Expand child').listeners.click({stopPropagation(){}});
  nodes = flatten(view.contentEl);
  assert.equal(bookmark().attrs['aria-label'], 'Open concept grandchild');
  nodes.find(n => n.attrs['aria-label'] === 'Open concept grandchild').listeners.click({});
  assert.deepEqual(events.pop(), ['open', grandchild.path]);
  nodes.find(n => n.attrs['aria-label'] === 'Collapse parent').listeners.click({stopPropagation(){}});
  assert.ok(!flatten(view.contentEl).some(n => n.textContent === 'child'));
});

test('when a collapsed node receives a new child it expands immediately', async () => {
  const {plugin, app} = setup();
  const index = file('Buches/F/_index.md');
  const parent = file('Buches/F/concepts/parent.md');
  const child = file('Buches/F/concepts/parent/child.md');
  const root = folder('Buches', [folder('Buches/F', [index, folder('Buches/F/concepts', [parent, folder('Buches/F/concepts/parent', [child])])])]);
  app.vault.getAbstractFileByPath = () => root;
  app.metadataCache.getFileCache = () => null;
  plugin.promptCreateSubconcept = () => {};
  const view = new BuchesView({app}, plugin);
  view.contentEl = new Element(); view.registerEvent = () => {};
  await view.onOpen();
  assert.ok(!flatten(view.contentEl).some(n => n.textContent === 'child'));
  flatten(view.contentEl).find(n => n.attrs['aria-label'] === 'New subconcept in parent').listeners.click({stopPropagation(){}});
  assert.ok(flatten(view.contentEl).some(n => n.textContent === 'child'));
});

test('view displays Buch titles and concept names with working actions', async () => {
  const {plugin, events, app} = setup();
  const view = new BuchesView({ app }, plugin);
  view.contentEl = new Element();
  view.registerEvent = () => {};
  assert.equal(view.getViewType(), VIEW_TYPE);
  await view.onOpen();
  let nodes = flatten(view.contentEl);
  assert.ok(nodes.some(n => n.textContent === 'A title'));
  assert.ok(nodes.some(n => n.textContent === 'A concept'));
  assert.ok(!nodes.some(n => n.textContent === '_index.md'));
  nodes.find(n => n.attrs['aria-label'] === 'New concept in A title').listeners.click({ stopPropagation() {} });
  assert.deepEqual(events[0], ['concept', 'Buches/F']);
  nodes.find(n => n.attrs['aria-label'] === 'Open concept A concept').listeners.click({});
  assert.deepEqual(events[1], ['open', 'Buches/F/concepts/thing.md']);
});
