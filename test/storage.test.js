const test = require('node:test');
const assert = require('node:assert/strict');
const storage = require('../src/storage');

function memoryVault() {
  const entries = new Map();
  return {
    entries,
    getAbstractFileByPath(path) { return entries.get(path) ?? null; },
    async createFolder(path) {
      if (entries.has(path)) throw new Error('already exists: ' + path);
      entries.set(path, { path, children: [] });
    },
    async create(path, content) {
      if (entries.has(path)) throw new Error('already exists: ' + path);
      const file = { path, content };
      entries.set(path, file);
      return file;
    },
  };
}

test('createBuch stores an index and concepts folder under the root', async () => {
  const vault = memoryVault();
  await storage.createBuch(vault, 'A Book');
  assert.ok(vault.entries.has('Buches/A Book/concepts'));
  assert.match(vault.entries.get('Buches/A Book/_index.md').content, /title: "A Book"/);
});


test('createConcept stores its name as metadata within its Buch', async () => {
  const vault = memoryVault();
  await storage.createBuch(vault, 'A Book');
  const file = await storage.createConcept(vault, 'Buches/A Book', 'A Concept');
  assert.equal(file.path, 'Buches/A Book/concepts/A Concept.md');
  assert.match(file.content, /name: "A Concept"/);
});

test('subconcepts are created beneath their parent without moving the parent note', async () => {
  const vault = memoryVault();
  await storage.createBuch(vault, 'Book');
  const parent = await storage.createConcept(vault, 'Buches/Book', 'Parent');
  const child = await storage.createSubconcept(vault, parent.path, 'Child');
  const grandchild = await storage.createSubconcept(vault, child.path, 'Grandchild');
  assert.equal(child.path, 'Buches/Book/concepts/Parent/Child.md');
  assert.equal(grandchild.path, 'Buches/Book/concepts/Parent/Child/Grandchild.md');
  assert.equal(vault.entries.get(parent.path), parent);
  assert.match(child.content, /^---\nname: "Child"\ndescription: ""\ncategory: ""\norder: \d+\ndepends_on: \[\]\n---\n$/);
  await assert.rejects(storage.createSubconcept(vault, parent.path, 'Child'), /already exists/i);
});

test('subconcepts require a real parent concept inside an indexed Buch', async () => {
  const vault = memoryVault();
  await storage.createBuch(vault, 'Book');
  for (const path of ['Other/Parent.md', 'Buches/Book/_index.md', 'Buches/Book/concepts/../Parent.md', 'Buches/Book/concepts/Missing.md']) {
    await assert.rejects(storage.createSubconcept(vault, path, 'Child'), /invalid|parent|concept/i);
  }
  assert.equal(vault.entries.has('Buches/Book/concepts/Missing'), false);
});

test('invalid subconcept names do not create a directory for the parent', async () => {
  const vault = memoryVault();
  await storage.createBuch(vault, 'Book');
  const parent = await storage.createConcept(vault, 'Buches/Book', 'Parent');
  await assert.rejects(storage.createSubconcept(vault, parent.path, 'bad/name'), /invalid/i);
  assert.equal(vault.entries.has('Buches/Book/concepts/Parent'), false);
});

test('invalid path names are rejected without creating vault entries', async () => {
  const vault = memoryVault();
  for (const name of ['', '.', '..', 'foo/bar', 'foo\\bar', 'bad:name', 'bad*name', 'line\nbreak']) {
    await assert.rejects(storage.createBuch(vault, name), /invalid|name|title/i);
  }
  assert.equal(vault.entries.size, 0);
});

test('creating a Buch does not change the title supplied by the user', async () => {
  const vault = memoryVault();
  await assert.rejects(storage.createBuch(vault, ' A Book '), /invalid/i);
  assert.equal(vault.entries.size, 0);
});

test('created folder names remain usable when a filename is a Windows device name', async () => {
  const vault = memoryVault();
  await storage.createBuch(vault, 'A Book');
  await assert.rejects(storage.createConcept(vault, 'Buches/A Book', 'CON'), /invalid/i);
  assert.equal(vault.entries.has('Buches/A Book/concepts/CON.md'), false);
});

test('duplicate Buches and concepts are never overwritten', async () => {
  const vault = memoryVault();
  await storage.createBuch(vault, 'Existing');
  await assert.rejects(storage.createBuch(vault, 'Existing'), /already exists/i);
  const concept = await storage.createConcept(vault, 'Buches/Existing', 'Idea');
  await assert.rejects(storage.createConcept(vault, 'Buches/Existing', 'Idea'), /already exists/i);
  assert.equal(vault.entries.get(concept.path), concept);
});

test('concept creation rejects a path outside its Buch root', async () => {
  const vault = memoryVault();
  await assert.rejects(storage.createConcept(vault, 'Other', 'Idea'), /invalid|buch/i);
  assert.equal(vault.entries.size, 0);
});

test('existing root file prevents root initialization', async () => {
  const vault = memoryVault();
  vault.entries.set('Buches', { path: 'Buches', content: '' });
  await assert.rejects(storage.ensureRoot(vault), /folder/i);
});
