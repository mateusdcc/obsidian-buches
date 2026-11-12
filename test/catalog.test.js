const test = require('node:test');
const assert = require('node:assert/strict');
const { listBuches } = require('../src/catalog');

function file(path) { return { path, name: path.split('/').pop(), extension: path.split('.').pop() }; }
function folder(path, children) { return { path, name: path.split('/').pop(), children }; }

test('catalog uses metadata titles and concept names, excluding non-Buch folders', () => {
  const aIndex = file('Buches/Directory A/_index.md');
  const zIndex = file('Buches/Z/_index.md');
  const concept = file('Buches/Directory A/concepts/physical.md');
  const root = folder('Buches', [
    folder('Buches/Z', [zIndex]),
    folder('Buches/Not a Buch', []),
    folder('Buches/Directory A', [aIndex, folder('Buches/Directory A/concepts', [concept])]),
  ]);
  const app = {
    vault: { getAbstractFileByPath: path => path === 'Buches' ? root : null },
    metadataCache: { getFileCache: f => ({ frontmatter: f === aIndex ? { title: 'Alpha' } : f === concept ? { name: 'Concept name' } : null }) },
  };
  const result = listBuches(app);
  assert.deepEqual(result.map(b => b.title), ['Alpha', 'Z']);
  assert.equal(result[0].concepts[0].name, 'Concept name');
  assert.equal(result[0].concepts[0].file, concept);
});

test('catalog builds a recursive concept tree without losing existing flat notes', () => {
  const index = file('Buches/B/_index.md');
  const a = file('Buches/B/concepts/A.md');
  const b = file('Buches/B/concepts/A/B.md');
  const c = file('Buches/B/concepts/A/B/C.md');
  const z = file('Buches/B/concepts/Z.md');
  const concepts = folder('Buches/B/concepts', [
    z, a, folder('Buches/B/concepts/A', [b, folder('Buches/B/concepts/A/B', [c])]),
  ]);
  const root = folder('Buches', [folder('Buches/B', [index, concepts])]);
  const app = { vault: {getAbstractFileByPath: () => root}, metadataCache: {getFileCache: f => ({frontmatter: { name: f === b ? 'Bee' : undefined }})} };
  const result = listBuches(app);
  assert.deepEqual(result[0].concepts.map(x => x.name), ['A', 'Z']);
  assert.equal(result[0].concepts[0].children[0].name, 'Bee');
  assert.equal(result[0].concepts[0].children[0].children[0].file, c);
});

test('catalog exposes the optional icon metadata for Buches and concepts', () => {
  const index = file('Buches/B/_index.md'), concept = file('Buches/B/concepts/A.md');
  const root=folder('Buches',[folder('Buches/B',[index,folder('Buches/B/concepts',[concept])])]);
  const app={vault:{getAbstractFileByPath:()=>root},metadataCache:{getFileCache:f=>({frontmatter:{icon:f===index?'book-open':'🌱'}})}};
  const book=listBuches(app)[0];
  assert.equal(book.icon,'book-open');
  assert.equal(book.concepts[0].icon,'🌱');
});

test('catalog ignores unattached directories rather than showing unparented notes as siblings', () => {
  const index = file('Buches/B/_index.md');
  const orphan = file('Buches/B/concepts/Gone/Child.md');
  const root = folder('Buches', [folder('Buches/B', [index, folder('Buches/B/concepts', [folder('Buches/B/concepts/Gone', [orphan])])])]);
  const app = {vault: {getAbstractFileByPath: () => root}, metadataCache: {getFileCache: () => null}};
  assert.deepEqual(listBuches(app)[0].concepts, []);
});
