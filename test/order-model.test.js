const test = require('node:test');
const assert = require('node:assert/strict');

function concept(name, path = `Buches/Book/concepts/${name}.md`, children = []) {
  return { file: { path }, name, children };
}
function appWithOrders(orders = {}) {
  return { metadataCache: { getFileCache: file => ({ frontmatter: { order: orders[file.path] } }) } };
}

test('legacy siblings retain the navigator’s natural, case-insensitive alphabetical order', () => {
  const { sortConcepts } = require('../src/order-model');
  const siblings = [concept('Chapter 10'), concept('chapter 2'), concept('Alpha')];
  const result = sortConcepts(appWithOrders(), siblings);
  assert.deepEqual(result.map(item => item.name), ['Alpha', 'chapter 2', 'Chapter 10']);
  assert.notEqual(result, siblings);
  assert.deepEqual(siblings.map(item => item.name), ['Chapter 10', 'chapter 2', 'Alpha']);
});

test('finite numeric orders precede unordered siblings, ties use the existing name order', () => {
  const { sortConcepts } = require('../src/order-model');
  const a = concept('Alpha'), b = concept('Beta'), c = concept('Charlie');
  const d = concept('Delta'), e = concept('Echo'), f = concept('Foxtrot'), g = concept('Golf');
  const app = appWithOrders({ [a.file.path]: '0', [b.file.path]: 2, [c.file.path]: -1,
    [d.file.path]: 2, [e.file.path]: NaN, [f.file.path]: Infinity, [g.file.path]: null });
  assert.deepEqual(sortConcepts(app, [g, f, e, d, c, b, a]).map(item => item.name),
    ['Charlie', 'Beta', 'Delta', 'Alpha', 'Echo', 'Foxtrot', 'Golf']);
});

test('equal orders and equal display names preserve their prior sequence', () => {
  const { sortConcepts } = require('../src/order-model');
  const a = concept('same', 'Buches/Book/concepts/A.md');
  const b = concept('Same', 'Buches/Book/concepts/B.md');
  const app = appWithOrders({ [a.file.path]: 0, [b.file.path]: 0 });
  assert.deepEqual(sortConcepts(app, [b, a]), [b, a]);
});

test('pagination starts at the index and visits each nested sibling group in rank order', () => {
  const { getPagination } = require('../src/order-model');
  const a = concept('Alpha'), b = concept('Beta');
  const a1 = concept('One', 'Buches/Book/concepts/Alpha/One.md');
  const a2 = concept('Two', 'Buches/Book/concepts/Alpha/Two.md');
  const a21 = concept('Deep', 'Buches/Book/concepts/Alpha/Two/Deep.md');
  a.children = [a1, a2]; a2.children = [a21];
  const index = { path: 'Buches/Book/_index.md' };
  const book = { path: 'Buches/Book', title: 'Book', index, concepts: [b, a] };
  const app = appWithOrders({ [a2.file.path]: 0, [a1.file.path]: 1 });
  const expected = [index, a.file, a2.file, a21.file, a1.file, b.file];
  for (let i = 0; i < expected.length; i++) {
    const page = getPagination(app, book, expected[i].path);
    assert.equal(page.previous?.file ?? null, i ? expected[i - 1] : null);
    assert.equal(page.next?.file ?? null, expected[i + 1] ?? null);
  }
  assert.equal(getPagination(app, book, a.file.path).previous.name, 'Book');
  assert.equal(getPagination(app, book, index.path).next, a);
  assert.equal(getPagination(app, book, 'Elsewhere.md'), null);
});

test('pagination on an empty Buch has no neighbors', () => {
  const { getPagination } = require('../src/order-model');
  const book = { path: 'Buches/Book', title: 'Book', index: { path: 'Buches/Book/_index.md' }, concepts: [] };
  assert.deepEqual(getPagination(appWithOrders(), book, book.index.path), { previous: null, next: null, index: 0, total: 0 });
});

test('reordering writes only the chosen siblings sequentially and preserves other frontmatter', async () => {
  const { reorderSiblings } = require('../src/order-model');
  const child = concept('Child', 'Buches/Book/concepts/Alpha/Child.md');
  const a = concept('Alpha', undefined, [child]), b = concept('Beta'), c = concept('Charlie');
  const book = { path: 'Buches/Book', index: { path: 'Buches/Book/_index.md' }, concepts: [c, a, b] };
  const store = new Map([a, b, c, child].map(item => [item.file.path, { name: item.name, tags: ['unchanged'] }]));
  const writes = []; let active = 0;
  const app = {
    metadataCache: { getFileCache: file => ({ frontmatter: store.get(file.path) }) },
    fileManager: { async processFrontMatter(file, update) {
      active++; assert.equal(active, 1, 'writes must not overlap');
      await new Promise(resolve => setImmediate(resolve));
      update(store.get(file.path)); writes.push(file.path); active--;
    } },
  };
  assert.equal(await reorderSiblings(app, book, c.file.path, a.file.path, 'before'), true);
  assert.deepEqual(writes, [c.file.path, a.file.path, b.file.path]);
  assert.deepEqual([c, a, b].map(item => store.get(item.file.path).order), [0, 1, 2]);
  assert.deepEqual(store.get(a.file.path), { name: 'Alpha', tags: ['unchanged'], order: 1 });
  assert.deepEqual(store.get(child.file.path), { name: 'Child', tags: ['unchanged'] });
  assert.deepEqual(sortNames(book.concepts), ['Charlie', 'Alpha', 'Beta']);
});
function sortNames(concepts) { return concepts.map(item => item.name); }

test('reordering rejects out-of-scope and invalid drops and does not write on no-ops', async () => {
  const { reorderSiblings } = require('../src/order-model');
  const child = concept('Child', 'Buches/Book/concepts/Alpha/Child.md');
  const a = concept('Alpha', undefined, [child]), b = concept('Beta');
  const book = { path: 'Buches/Book', index: { path: 'Buches/Book/_index.md' }, concepts: [a, b] };
  const app = appWithOrders(); const writes = [];
  app.fileManager = { processFrontMatter: async file => writes.push(file.path) };
  for (const [source, target, position] of [
    [a.file.path, child.file.path, 'before'],
    [child.file.path, b.file.path, 'after'],
    [a.file.path, 'Buches/Other/concepts/Other.md', 'before'],
    ['Buches/Other/concepts/Other.md', a.file.path, 'before'],
    [book.index.path, a.file.path, 'before'],
    [a.file.path, a.file.path, 'after'],
    [a.file.path, b.file.path, 'before'],
    [a.file.path, b.file.path, 'inside'],
  ]) assert.equal(await reorderSiblings(app, book, source, target, position), false);
  assert.deepEqual(writes, []);
});

test('reordering rejects duplicate paths and malformed or out-of-scope catalog entries before writing', async () => {
  const { reorderSiblings } = require('../src/order-model');
  const a = concept('Alpha'), b = concept('Beta');
  const app = appWithOrders(); const writes = [];
  app.fileManager = { processFrontMatter: async file => writes.push(file.path) };
  const book = concepts => ({ path: 'Buches/Book', index: { path: 'Buches/Book/_index.md' }, concepts });
  for (const invalid of [
    book([a, b, concept('Duplicate', a.file.path)]),
    book([a, b, concept('Outside', 'Buches/Other/concepts/Outside.md')]),
    book([a, b, concept('Wrong parent', 'Buches/Book/concepts/Nested/Child.md')]),
    book([a, b, concept('Traversal', 'Buches/Book/concepts/../_index.md')]),
    { ...book([a, b]), index: { path: 'Buches/Other/_index.md' } },
  ]) assert.equal(await reorderSiblings(app, invalid, b.file.path, a.file.path, 'before'), false);
  assert.deepEqual(writes, []);
});
