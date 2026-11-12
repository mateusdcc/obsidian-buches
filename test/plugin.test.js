const test = require('node:test');
const assert = require('node:assert/strict');
const BuchesPlugin = require('../src/plugin');

function fakeApp() {
  const entries = new Map();
  const vault = {
    getAbstractFileByPath: path => entries.get(path) ?? null,
    async createFolder(path) { entries.set(path, {path, children: []}); },
    async create(path, content) { const file = {path, content}; entries.set(path, file); return file; },
  };
  const workspace = { onLayoutReady(fn) { this.ready = fn; }, getLeavesOfType: () => [], on: () => ({}), iterateAllLeaves() {} };
  vault.on = () => ({});
  const metadataCache = { on: () => ({}), getFileCache: () => null };
  return { app: {vault, workspace, metadataCache}, entries };
}

test('plugin initializes root and registers the requested command and view', async () => {
  const {app, entries} = fakeApp();
  const plugin = new BuchesPlugin(app, {});
  await plugin.onload();
  assert.ok(entries.has('Buches'));
  assert.ok(plugin.commands.some(c => c.id === 'create-buch' && c.name === 'Create Buch'));
  assert.ok(plugin.views.has('buches-navigator'));
  assert.ok(plugin.views.has('buches-context'));
  assert.equal(typeof app.workspace.ready, 'function');
});

test('subconcept prompt creates and opens the child of the chosen concept', async () => {
  const {app, entries} = fakeApp();
  const plugin = new BuchesPlugin(app, {});
  await plugin.onload();
  entries.set('Buches/B', {path:'Buches/B', children:[]});
  entries.set('Buches/B/_index.md', {path:'Buches/B/_index.md'});
  entries.set('Buches/B/concepts', {path:'Buches/B/concepts', children:[]});
  entries.set('Buches/B/concepts/Parent.md', {path:'Buches/B/concepts/Parent.md'});
  let opened;
  plugin.openFile = async file => { opened = file; };
  plugin.promptCreateSubconcept('Buches/B/concepts/Parent.md');
  assert.equal(app.lastModal.options.title, 'Create subconcept');
  await app.lastModal.options.onSubmit('Child');
  assert.equal(opened.path, 'Buches/B/concepts/Parent/Child.md');
});
